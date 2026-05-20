import {
  getActiveCheckInEvent,
  writeSignOutEventAndClearActive,
} from '../services/dynamo.mjs';
import { getMember } from '../services/members.mjs';
import { isAlreadyCheckedIn } from '../utils/stateCheck.mjs';

const REQUIRED_FIELDS = ['membershipName', 'email'];

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function getHeader(req, name) {
  return req.get?.(name) ?? req.headers?.[name.toLowerCase()];
}

function getMembershipName(body) {
  const oldMembershipName = cleanString(body?.membershipName);

  if (hasValue(oldMembershipName)) {
    return oldMembershipName;
  }

  return [
    cleanString(body?.first_name),
    cleanString(body?.last_name),
  ].filter(hasValue).join(' ');
}

function normalizeRequest(body) {
  return {
    membershipName: getMembershipName(body),
    email: cleanString(body?.email),
    phone: cleanString(body?.phone),
    locationId: cleanString(body?.location_id) || process.env.GHL_LOCATION_ID,
    formType: cleanString(body?.form_type),
  };
}

function getMissingFields(payload) {
  return REQUIRED_FIELDS.filter((field) => {
    return !hasValue(payload?.[field]);
  });
}

function normalizeManualSignOutRequest(body) {
  return {
    locationId: cleanString(body?.location_id),
    email: cleanString(body?.email),
    phone: cleanString(body?.phone),
    signedOutBy: 'front_desk_pin',
  };
}

function getManualMissingFields(payload) {
  const missingFields = [];

  if (!hasValue(payload?.locationId)) {
    missingFields.push('location_id');
  }

  if (!hasValue(payload?.email) && !hasValue(payload?.phone)) {
    missingFields.push('email or phone');
  }

  return missingFields;
}

export async function signOutHandler(req, res, next) {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (webhookSecret && getHeader(req, 'X-Webhook-Secret') !== webhookSecret) {
      return res.status(401).json({
        valid: false,
        message: 'Unauthorized',
      });
    }

    const payload = normalizeRequest(req.body);

    if (payload.formType && payload.formType !== 'pool_signout') {
      return res.status(400).json({
        valid: false,
        message: 'Unsupported form type',
      });
    }

    const missingFields = getMissingFields(payload);

    if (missingFields.length > 0) {
      return res.status(400).json({
        valid: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    const { membershipName, email, phone, locationId } = payload;

    if (!locationId) {
      return res.status(400).json({
        valid: false,
        message: 'Missing required fields: locationId',
      });
    }

    const member = await getMember(locationId, email);
    const eventPhone = hasValue(phone) ? phone : member?.phone;

    if (!member) {
      return res.status(404).json({
        valid: false,
        message: 'Please sign up or see staff',
      });
    }

    if (!eventPhone) {
      return res.status(400).json({
        valid: false,
        message: 'Missing required fields: phone',
      });
    }

    const alreadyCheckedIn = await isAlreadyCheckedIn(
      locationId,
      membershipName,
      eventPhone,
    );

    if (!alreadyCheckedIn) {
      return res.status(409).json({
        valid: false,
        message: "You haven't checked in today",
      });
    }

    await writeSignOutEventAndClearActive(
      locationId,
      membershipName,
      eventPhone,
      {
        email,
        signedOutBy: 'webhook',
      },
    );

    return res.status(200).json({
      valid: true,
      message: `Goodbye ${membershipName}!`,
    });
  } catch (error) {
    return next(error);
  }
}

export async function manualSignOutHandler(req, res, next) {
  try {
    const payload = normalizeManualSignOutRequest(req.body);
    const missingFields = getManualMissingFields(payload);

    if (missingFields.length > 0) {
      return res.status(400).json({
        valid: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    const member = hasValue(payload.email)
      ? await getMember(payload.locationId, payload.email)
      : null;
    const eventPhone = hasValue(payload.phone) ? payload.phone : member?.phone;

    if (hasValue(payload.email) && !member && !eventPhone) {
      return res.status(404).json({
        valid: false,
        message: 'Member not found',
      });
    }

    if (!eventPhone) {
      return res.status(400).json({
        valid: false,
        message: 'Missing required fields: phone',
      });
    }

    const activeCheckInEvent = await getActiveCheckInEvent(payload.locationId, eventPhone);

    if (!activeCheckInEvent) {
      return res.status(409).json({
        valid: false,
        message: 'No active check-in found',
      });
    }

    const membershipName = activeCheckInEvent.membershipName
      ?? member?.membershipName
      ?? 'member';

    console.log('Manual sign-out by staff:', {
      name: membershipName,
      email: payload.email || member?.email,
      phone: eventPhone,
    });

    await writeSignOutEventAndClearActive(
      payload.locationId,
      membershipName,
      eventPhone,
      {
        email: payload.email || member?.email,
        signedOutBy: payload.signedOutBy,
        eventType: 'manual_signout',
        manual: true,
        source: 'dashboard_manual',
        userAgent: req.headers?.['user-agent'],
      },
      activeCheckInEvent,
    );

    return res.status(200).json({
      valid: true,
      message: `Signed out ${membershipName}`,
    });
  } catch (error) {
    return next(error);
  }
}
