import { writeCheckInEvent } from '../services/dynamo.mjs';
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

    await writeCheckInEvent(
      locationId,
      membershipName,
      eventPhone,
      'sign_out',
      undefined,
      undefined,
    );

    return res.status(200).json({
      valid: true,
      message: `Goodbye ${membershipName}!`,
    });
  } catch (error) {
    return next(error);
  }
}
