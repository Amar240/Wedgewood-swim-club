import { getLatestEvent } from '../services/dynamo.mjs';

export async function isAlreadyCheckedIn(locationId, membershipName, phone) {
  try {
    const latestEvent = await getLatestEvent(locationId, membershipName, phone);
    return latestEvent?.type === 'check_in';
  } catch (error) {
    throw new Error(`Failed to check membership state: ${error.message}`);
  }
}
