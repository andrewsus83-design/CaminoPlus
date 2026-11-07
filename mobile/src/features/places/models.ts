// Rows -> what the Stays tab and the stay page draw. Pure (no React Native imports): plain node tests cover it
// (npm run test:places).
//
// A real stay never carries a rating, a review count or a price: they are not in OpenStreetMap, so the model says
// "not known" (null, "Price not known") instead of a number. The bundled samples keep their examples exactly as the
// screens always showed them (same words, same numbers), marked `sample`.
import { stays as sampleStays, type Stay } from '../../data/mock';
import { PRICE_NOT_KNOWN, labelNames, placeSourceLine, priceTier, stayCategoryLabel, stayGroup, staySubtitle, stayTint } from './present';
import type { StayModel, StayRow } from './types';

/** A real stay as the screens draw it. */
export function toStayModel(row: StayRow): StayModel {
  const kindLabel = stayCategoryLabel(row.category);
  const labels = labelNames(row.labels);
  return {
    id: row.id,
    sample: false,
    name: row.name,
    group: stayGroup(row.category),
    kindLabel,
    town: row.place_name,
    tint: stayTint(row.category),
    verifiedOwner: row.verification_level === 'owner',
    rating: null,
    reviews: null,
    priceText: PRICE_NOT_KNOWN,
    priceTier: null,
    chip: labels[0] ?? null,
    distanceKm: row.detour_m == null ? null : row.detour_m / 1000,
    subtitle: staySubtitle({ kindLabel, town: row.place_name, km: row.km_from_stage_start, detourM: row.detour_m }),
    sourceLine: placeSourceLine(row.source, row.verification_level, row.verification_at),
    row,
  };
}

/** A bundled sample stay, drawn exactly as the Stays tab always drew it. */
export function toSampleStayModel(s: Stay): StayModel {
  return {
    id: s.id,
    sample: true,
    name: s.name,
    group: s.kind,
    kindLabel: s.kind,
    town: s.town,
    tint: s.tint,
    verifiedOwner: !!s.verifiedOwner,
    rating: s.rating,
    reviews: s.reviews,
    priceText: s.price ? `€${s.price} / night` : 'Café',
    priceTier: priceTier(s.price),
    chip: s.label,
    distanceKm: s.distanceKm,
    subtitle: `${s.kind} · ${s.town} · ${s.distanceKm} km away · ${s.reviews} reviews`,
    sourceLine: null,
    row: null,
  };
}

export const sampleStayModels = (): StayModel[] => sampleStays.map(toSampleStayModel);

/** A stay worth listing: a place to sleep or to eat. Shops, pharmacies and services are not stays. */
export const isListedStay = (row: StayRow) => row.kind !== 'service';
