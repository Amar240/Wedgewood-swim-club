import { writeCheckInEvent } from '../services/dynamo.mjs';
import { getMember } from '../services/members.mjs';
import { isAlreadyCheckedIn } from '../utils/stateCheck.mjs';

const REQUIRED_FIELDS = ['membershipName', 'email', 'phone'];

function getMissingFields(body) {
  return REQUIRED_FIELDS.filter((field) => {
    const value = body?.[field];
    return value === undefined || value === null || value === '';
  });
}

export async function signOutHandler(req, res, next) {
  try {
    const missingFields = getMissingFields(req.body);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields,
      });
    }

    const { membershipName, email, phone } = req.body;
    const locationId = process.env.GHL_LOCATION_ID;

    if (!locationId) {
      throw new Error('Missing required environment variable: GHL_LOCATION_ID');
    }

    const member = await getMember(locationId, email);

    if (!member) {
      return res.status(404).json({
        error: 'Member not found',
        message: 'Please sign up or see staff',
      });
    }

    const alreadyCheckedIn = await isAlreadyCheckedIn(
      locationId,
      membershipName,
      phone,
    );

    if (!alreadyCheckedIn) {
      return res.status(409).json({
        error: 'Not signed in',
        message: "You haven't checked in today",
      });
    }

    await writeCheckInEvent(
      locationId,
      membershipName,
      phone,
      'sign_out',
      undefined,
      undefined,
    );

    return res.status(200).json({
      success: true,
      message: 'Sign-out recorded successfully',
      data: {
        membershipName,
        phone,
        type: 'sign_out',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error);
  }
}
