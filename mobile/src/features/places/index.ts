// Public surface of the places module. Screens import from '@/features/places' only.
//
// Real stays, cafes, churches and fountains along a stage, read from Supabase (rpc list_stage_stays / list_stage_pois),
// with a saved copy for when there is no signal and the bundled sample when the database has nothing for the stage.
// Prices, ratings and reviews are not in OpenStreetMap: a real place never shows one (it says "Price not known").
export { useMyStage, useStagePois, useStageStays } from './usePlaces';
export { openLink } from './open';
export { OSM_COPYRIGHT_URL, OSM_CREDIT, mailtoUrl, osmObjectUrl, safeWebUrl, telUrl, webLabel } from './links';
export { PRICE_NOT_KNOWN, amenityNames, kmIntoStageText, labelNames, offRouteText, sampleStaysNotice, savedLine, verificationLabel } from './present';
export { choosePins, samplePins } from './pins';
export type { PlacePin, PlaceSource, PlacesState, PriceTier, StayGroup, StayModel, StayRow } from './types';
