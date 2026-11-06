import { Alert, Linking } from 'react-native';
import type { Draft } from '@/data/business';

const TEAM = 'hello@camino.plus';

/**
 * Business listings are not live yet, so the last registration step really does what its button says:
 * it opens an email to the team with the details the owner typed. (Tax ID, photos and proof of ownership
 * are NOT put in an email: we ask for those by reply once listings open.)
 */
export async function emailListingDetails(d: Draft): Promise<boolean> {
  const lines = [
    'Hello CaminoPlus team,',
    '',
    'I would like to list my place when business listings open.',
    '',
    `Type: ${d.type || '-'}`,
    `Name: ${d.name || '-'}`,
    `Address: ${d.address || '-'}`,
    `Opening hours: ${d.hours || '-'}`,
    `Amenities: ${d.amenities.join(', ') || '-'}`,
    `Bed price: ${d.priceBed || '-'}  Room price: ${d.priceRoom || '-'}`,
    `How pilgrims book: ${d.booking.join(', ') || '-'}`,
    '',
    'I can send photos and proof of ownership when you ask for them.',
  ];
  const url = `mailto:${TEAM}?subject=${encodeURIComponent('List my place on CaminoPlus')}&body=${encodeURIComponent(lines.join('\n'))}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert('No email app found', `Please write to ${TEAM} and tell us about your place. We will reply when business listings open.`);
    return false;
  }
}
