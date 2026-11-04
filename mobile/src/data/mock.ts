// Sample data for UI work. Replaced by Supabase + local SQLite later.
export const tints = ['#E9C987', '#9DB4CC', '#BFD0C4', '#D7C6E0', '#F2D8B6', '#C9A48A'];

export const journey = [
  { id: 'j1', place: 'Burgos', when: 'Today · 07:40', km: 31.1, text: 'Reached the cathedral at sunrise. 31 km to Hontanas tomorrow, legs say no, heart says yes.', likes: 42, tint: tints[0] },
  { id: 'j2', place: 'Castrojeriz', when: 'Yesterday', km: 24.6, text: 'Best pilgrim menu so far. Lentils and a very strong coffee.', likes: 28, tint: tints[2] },
  { id: 'j3', place: 'Hornillos', when: '2 days ago', km: 21.0, text: 'Met Hannah and Lucas on the meseta. Buen Camino!', likes: 63, tint: tints[1] },
];

export const stamps = [
  { id: 's1', name: 'Burgos', date: '3 Nov', tint: tints[0] },
  { id: 's2', name: 'Castrojeriz', date: '2 Nov', tint: tints[2] },
  { id: 's3', name: 'Hornillos', date: '1 Nov', tint: tints[1] },
  { id: 's4', name: 'Logroño', date: '24 Oct', tint: tints[3] },
  { id: 's5', name: 'Pamplona', date: '19 Oct', tint: tints[4] },
  { id: 's6', name: 'Roncesvalles', date: '16 Oct', tint: tints[5] },
];

export const plan = [
  { id: 'p1', stage: 'Burgos → Hornillos', km: 20.5, done: true },
  { id: 'p2', stage: 'Hornillos → Castrojeriz', km: 19.8, done: true },
  { id: 'p3', stage: 'Castrojeriz → Frómista', km: 25.1, done: false },
  { id: 'p4', stage: 'Frómista → Carrión', km: 19.3, done: false },
];

export type Stay = { id: string; name: string; kind: 'Albergue' | 'Hotel' | 'Café'; town: string; price: number | null; rating: number; reviews: number; distanceKm: number; label: string; tint: string };
export const stays: Stay[] = [
  { id: 'st1', name: 'Albergue El Puntido', kind: 'Albergue', town: 'Hontanas', price: 14, rating: 4.8, reviews: 312, distanceKm: 0.3, label: 'Book by email', tint: tints[0] },
  { id: 'st2', name: 'Hotel Camino Real', kind: 'Hotel', town: 'Burgos', price: 68, rating: 4.5, reviews: 128, distanceKm: 1.2, label: 'Instant booking', tint: tints[1] },
  { id: 'st3', name: 'Café El Peregrino', kind: 'Café', town: 'Castrojeriz', price: null, rating: 4.7, reviews: 96, distanceKm: 0.6, label: 'Opens 08:00', tint: tints[4] },
  { id: 'st4', name: 'Albergue San Antón', kind: 'Albergue', town: 'Castrojeriz', price: 12, rating: 4.6, reviews: 204, distanceKm: 0.9, label: 'WhatsApp', tint: tints[2] },
];

export const notifications = [
  { id: 'n1', title: 'Meseta Walker unlocked. You earned +100 XP.', time: '2 min ago', unread: true },
  { id: 'n2', title: 'Hannah liked your post "Reached the cathedral…"', time: '14 min ago', unread: true },
  { id: 'n3', title: '3 new photos of you from O Cebreiro.', time: '1 h ago', unread: true },
  { id: 'n4', title: 'Albergue El Puntido confirmed your bed for Fri 14 Nov.', time: 'Yesterday', unread: false },
];

export const messages = [
  { id: 'm1', name: 'María · El Puntido', text: 'See you at 18:00. Dinner is at 19:30!', time: '5 min', unread: 2, tint: tints[2] },
  { id: 'm2', name: 'Café El Peregrino', text: 'Yes, we open at 08:00 for pilgrims.', time: 'Yesterday', unread: 0, tint: tints[0] },
  { id: 'm3', name: 'Hannah', text: 'Haha, see you in Hontanas!', time: 'Mon', unread: 0, tint: tints[3] },
];
