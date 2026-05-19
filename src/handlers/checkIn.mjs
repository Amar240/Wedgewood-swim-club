import { writeCheckInEvent } from '../services/dynamo.mjs';
import { getMember } from '../services/members.mjs';
import { isAlreadyCheckedIn } from '../utils/stateCheck.mjs';

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
  const rawNumAttending = body?.numAttending ?? body?.num_attending;
  const rawNumGuests = body?.numGuests ?? body?.num_guests;

  return {
    membershipName: getMembershipName(body),
    email: cleanString(body?.email),
    phone: cleanString(body?.phone),
    numAttending: hasValue(rawNumAttending) ? rawNumAttending : 1,
    numGuests: hasValue(rawNumGuests) ? rawNumGuests : 0,
    locationId: cleanString(body?.location_id) || process.env.GHL_LOCATION_ID,
    membershipNameFromForm: cleanString(body?.membership_name),
    guestPass: cleanString(body?.guest_pass),
    formType: cleanString(body?.form_type),
  };
}

function getMissingFields(payload) {
  const missingFields = [];

  if (!hasValue(payload?.locationId)) {
    missingFields.push('locationId');
  }

  if (!hasValue(payload?.email) && !hasValue(payload?.phone)) {
    missingFields.push('email or phone');
  }

  return missingFields;
}

export async function checkInHandler(req, res, next) {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (webhookSecret && getHeader(req, 'X-Webhook-Secret') !== webhookSecret) {
      return res.status(401).json({
        valid: false,
        message: 'Unauthorized',
      });
    }

    const payload = normalizeRequest(req.body);

    if (payload.formType && payload.formType !== 'pool_signin') {
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

    const {
      membershipName,
      phone,
      email,
      numAttending,
      numGuests,
      locationId,
      membershipNameFromForm,
      guestPass,
      formType,
    } = payload;

    const member = hasValue(email) ? await getMember(locationId, email) : null;
    const eventPhone = hasValue(phone) ? phone : member?.phone;
    const eventMembershipName = hasValue(membershipName)
      ? membershipName
      : member?.membershipName;

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
      eventMembershipName,
      eventPhone,
    );

    if (alreadyCheckedIn) {
      return res.status(409).json({
        valid: false,
        message: 'Please sign out first',
      });
    }

    if (Number(numAttending) > Number(member.maxMembers)) {
      return res.status(403).json({
        valid: false,
        message: `Your plan allows ${member.maxMembers} members`,
      });
    }

    await writeCheckInEvent(
      locationId,
      eventMembershipName,
      eventPhone,
      'check_in',
      numAttending,
      numGuests,
      {
        membershipNameFromForm,
        guestPass,
        formType,
      },
    );

    return res.status(200).json({
      valid: true,
      message: `Welcome ${eventMembershipName}!`,
      membershipType: member.membershipType,
      maxMembers: member.maxMembers,
      familyMembers: member.familyTextRaw ?? null,
    });
  } catch (error) {
    return next(error);
  }
}
