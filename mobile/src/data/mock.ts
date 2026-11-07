// SAMPLE data behind the preview screens (Stays, stay detail, Discover, business tools). Those screens
// say "Sample" on screen (components/SampleNotice) and never share this content outside the app.
// The stays are now the FALLBACK: the Stays tab and the stay page read the real places of the stage from Supabase
// (src/features/places, rpc list_stage_stays) and show these only while the database has none for it.
// Replaced by Supabase data (posts) as the other screens go live.
export const tints = ['#E9C987', '#9DB4CC', '#BFD0C4', '#D7C6E0', '#F2D8B6', '#C9A48A'];

export type Stay = { id: string; name: string; kind: 'Albergue' | 'Hotel' | 'Café'; town: string; price: number | null; rating: number; reviews: number; distanceKm: number; label: string; tint: string; verifiedOwner?: boolean };
export const stays: Stay[] = [
  { id: 'st1', name: 'Albergue El Puntido', kind: 'Albergue', town: 'Hontanas', price: 14, rating: 4.8, reviews: 312, distanceKm: 0.3, label: 'Book by email', tint: tints[0], verifiedOwner: true },
  { id: 'st2', name: 'Hotel Camino Real', kind: 'Hotel', town: 'Burgos', price: 68, rating: 4.5, reviews: 128, distanceKm: 1.2, label: 'Instant booking', tint: tints[1] },
  { id: 'st3', name: 'Café El Peregrino', kind: 'Café', town: 'Castrojeriz', price: null, rating: 4.7, reviews: 96, distanceKm: 0.6, label: 'Opens 08:00', tint: tints[4] },
  { id: 'st4', name: 'Albergue San Antón', kind: 'Albergue', town: 'Castrojeriz', price: 12, rating: 4.6, reviews: 204, distanceKm: 0.9, label: 'WhatsApp', tint: tints[2] },
];

export const rooms = [
  { id: 'r1', name: 'Dorm bed (8)', price: 14, note: 'Breakfast not included' },
  { id: 'r2', name: 'Private double', price: 42, note: 'Shared bathroom' },
];
export const reviews = [
  { id: 'v1', who: 'Hannah', when: 'Oct 2026', text: 'Warm welcome, communal dinner was the highlight of my week.' },
  { id: 'v2', who: 'Lucas', when: 'Sep 2026', text: 'Clean, quiet, great showers. Book ahead in high season.' },
];
export const exploreItems = [
  { id: 'e1', user: 'hannah', caption: 'Sunrise over the meseta', tint: '#E9C987' },
  { id: 'e2', user: 'lucas', caption: 'Cruz de Ferro', tint: '#9DB4CC' },
  { id: 'e3', user: 'ana', caption: 'Pilgrim menu, 3 courses', tint: '#BFD0C4' },
  { id: 'e4', user: 'maria', caption: 'Stamp number 6!', tint: '#D7C6E0' },
];
