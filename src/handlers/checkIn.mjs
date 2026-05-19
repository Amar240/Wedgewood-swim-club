import { writeCheckInEvent } from '../services/dynamo.mjs';
import { getMember } from '../services/members.mjs';
import { isAlreadyCheckedIn } from '../utils/stateCheck.mjs';

const REQUIRED_FIELDS = [
  'membershipName',
  'phone',
  'email',
  'numAttending',
  'numGuests',
];

function getMissingFields(body) {
  return REQUIRED_FIELDS.filter((field) => {
    const value = body?.[field];
    return value === undefined || value === null || value === '';
  });
}

export async function checkInHandler(req, res, next) {
  try {
    const missingFields = getMissingFields(req.body);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields,
      });
    }

    const {
      membershipName,
      phone,
      email,
      numAttending,
      numGuests,
    } = req.body;
    const locationId = process.env.GHL_LOCATION_ID;

    if (!locationId) {
      throw new Error('Missing required environment variable: GHL_LOCATION_ID');
    }

    const alreadyCheckedIn = await isAlreadyCheckedIn(locationId, membershipName);

    if (alreadyCheckedIn) {
      return res.status(409).json({
        error: 'Already checked in',
        message: 'Please sign out first',
      });
    }

    const member = await getMember(locationId, membershipName, phone);

    if (!member) {
      return res.status(404).json({
        error: 'Member not found',
        message: 'Please sign up or see staff',
      });
    }

    if (Number(numAttending) > Number(member.maxMembers)) {
      return res.status(403).json({
        error: 'Exceeds membership limit',
        message: `Your plan allows ${member.maxMembers} members`,
      });
    }

    await writeCheckInEvent(
      locationId,
      membershipName,
      'check_in',
      numAttending,
      numGuests,
    );

    return res.status(200).json({
      success: true,
      message: 'Check-in recorded successfully',
      data: {
        membershipName,
        phone,
        email,
        numAttending,
        numGuests,
        type: 'check_in',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error);
  }
}
