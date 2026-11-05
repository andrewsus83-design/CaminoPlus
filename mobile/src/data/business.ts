// Sample data for the business-owner (extranet) screens.
// Shapes follow supabase/migrations/20261105100000_business_owners.sql.
import { tints } from './mock';

export type ListingStatus = 'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'suspended';
export type Availability = 'available' | 'few_left' | 'full' | 'closed';

export const businessTypes = [
  { id: 'albergue_private', title: 'Albergue', hint: 'Municipal, parish or private', icon: 'stays' },
  { id: 'hotel', title: 'Hotel or pensión', hint: 'Hostal, casa rural, apartment', icon: 'stays' },
  { id: 'cafe', title: 'Café or bar', hint: 'Breakfast, bocadillos', icon: 'chat' },
  { id: 'restaurant', title: 'Restaurant', hint: 'Menú del peregrino', icon: 'star' },
  { id: 'shop', title: 'Shop or pharmacy', hint: 'Supplies, blisters, SIM', icon: 'briefcase' },
  { id: 'other_service', title: 'Pilgrim service', hint: 'Bikes, luggage, tours', icon: 'flag' },
] as const;

export const amenityOptions = ['Wi-Fi', 'Kitchen', 'Laundry', 'Lockers', 'Bike storage', 'Charging', 'Breakfast', 'Pets welcome'];

export const bookingOptions = [
  { id: 'whatsapp', title: 'WhatsApp', soon: false },
  { id: 'email', title: 'Email', soon: false },
  { id: 'phone', title: 'Phone call', soon: false },
  { id: 'walk_in', title: 'Walk-in only', soon: false },
  { id: 'in_app', title: 'In-app booking', soon: true },
] as const;

export const proofKinds = ['Tourism register', 'Business licence', 'Tax ID (NIF / CIF)', 'Utility bill at this address'];

export type Draft = {
  type: string;
  name: string;
  address: string;
  photos: string[];          // tints stand in for photos
  amenities: string[];
  hours: string;
  priceBed: string;
  priceRoom: string;
  booking: string[];
  taxId: string;
  proof: string | null;
};

export const emptyDraft: Draft = {
  type: '', name: '', address: '', photos: [], amenities: ['Wi-Fi'], hours: '12:00 – 22:00',
  priceBed: '', priceRoom: '', booking: ['whatsapp'], taxId: '', proof: null,
};

export const myListing = {
  id: 'bl1',
  name: 'Albergue Casa Ana',
  town: 'Hontanas',
  beds: 24,
  status: 'approved' as ListingStatus,
  tint: tints[4],
  stats: { views: 1840, viewsDelta: 24, saves: 212, savesDelta: 9, contactTaps: 64 },
  timeline: [
    { status: 'Sent', when: '3 Nov · 10:42', done: true },
    { status: 'In review', when: '3 Nov · 15:10', done: true },
    { status: 'Live in Stays', when: '4 Nov · 09:05', done: true },
  ],
  reviews: [
    { id: 'r1', who: 'Hannah', stars: 5, when: '2 days ago', text: 'Warm welcome and the best communal dinner of my Camino.', reply: null as string | null },
    { id: 'r2', who: 'Lucas', stars: 4, when: 'Last week', text: 'Clean and quiet. Showers could be warmer.', reply: 'Thanks Lucas! We fixed the boiler on Monday.' },
  ],
};

export const statusCopy: Record<ListingStatus, { label: string; tone: 'gold' | 'green' | 'red' | 'neutral' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Sent for review', tone: 'gold' },
  in_review: { label: 'In review', tone: 'gold' },
  changes_requested: { label: 'Changes needed', tone: 'red' },
  approved: { label: 'Live', tone: 'green' },
  rejected: { label: 'Not approved', tone: 'red' },
  suspended: { label: 'Paused', tone: 'red' },
};
