// Turning what OpenStreetMap says into something the phone may open. The text of a place comes from a database anybody
// can edit, so nothing is opened without checking it first: a web address must be http(s) with a real host (never
// javascript:, data:, file: or an address with a user name in it), a phone number must look like a number, an e-mail
// address must look like one and carry no extra header. Pure (no React Native imports): plain node tests cover it
// (npm run test:places).
import type { OsmType } from './types';

const HOST = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+';
const WEB = new RegExp(`^(https?)://(${HOST})(:\\d{1,5})?([/?#][^\\s]*)?$`, 'i');
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** A web address that is safe to open, or null. "www.example.es/albergue" gets https:// in front. */
export function safeWebUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = raw.trim();
  if (!t || /\s/.test(t) || t.length > 300) return null;
  // Anything that names a scheme other than http(s) is refused: javascript:, data:, file:, intent:, mailto: ...
  if (HAS_SCHEME.test(t) && !/^https?:\/\//i.test(t)) return null;
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  const m = WEB.exec(t);
  if (!m) return null;
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${m[3] ?? ''}${m[4] ?? ''}`;
}

/** The address as the person reads it: no scheme, no "www.", no trailing slash ("https://www.casa.es/" -> "casa.es"). */
export function webLabel(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

/** A tel: link for the first number of the field, or null when it does not look like a phone number. */
export function telUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(/[;,/]/)[0];
  const plus = /^[\s(]*\+/.test(first) ? '+' : ''; // "+34 ..." and "(+34) ..." both keep the plus
  const digits = first.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return null;
  return `tel:${plus}${digits}`;
}

const EMAIL = /^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

/** The first e-mail address of the field when it is a plain address, else null. */
export function cleanEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(/[;,]/)[0].trim();
  return EMAIL.test(first) && first.length <= 120 ? first : null;
}

/** A mailto: link (the address only, never a subject or a copy line), or null. */
export function mailtoUrl(raw: string | null | undefined): string | null {
  const e = cleanEmail(raw);
  return e ? `mailto:${e}` : null;
}

/** The OpenStreetMap page of the object a place came from, or null without a usable type and id. */
export function osmObjectUrl(type: OsmType | null | undefined, id: number | null | undefined): string | null {
  if (type !== 'node' && type !== 'way' && type !== 'relation') return null;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
  return `https://www.openstreetmap.org/${type}/${id}`;
}

/** The page that explains the licence of the data (ODbL) and the credit that goes with it. */
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
/** The credit line the licence asks for. */
export const OSM_CREDIT = '© OpenStreetMap contributors';
