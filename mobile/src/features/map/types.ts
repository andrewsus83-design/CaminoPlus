import type { LngLat } from './geo';
import type { PoiKind } from './sampleRoute';
import type { TileSource } from './style';

/** 'Helicopter' = the whole route. 'City' = the Walk view (tilted, heading-up, close to the walker). */
export type MapLayerMode = 'Helicopter' | 'City';

export type MapViewProps = {
  layer: MapLayerMode;
  /** Draw MapTiler online tiles (only when online and a key is set). */
  online: boolean;
  /** Local .pmtiles sources for downloaded stages (used when not online). */
  packSources: TileSource[];
  glyphs: string;
  done: LngLat[];
  remaining: LngLat[];
  walker: { at: LngLat; accuracyM: number | null; sample: boolean } | null;
  /** Centre for the City layer. */
  focus: LngLat;
  /** Bumped by "locate me" / "Re-center" to fly the camera back to the walker. */
  recenterKey: number;
  /** Zoom buttons: bump n to zoom one level in (dir 1) or out (dir -1). */
  zoomCmd?: { dir: 1 | -1; n: number };
  selectedPoiId?: string;
  onSelectPoi: (id: string | undefined) => void;
  saver: boolean;
  /** Screen space covered by the banner and the card (or the sheet and tab bar), kept clear by the camera. */
  insets: { top: number; bottom: number };

  // Walk view (all optional: the Helicopter layer ignores them)
  /** The dark palette, chosen by the screen (automatic from the sun, or by the sun/moon button). */
  night?: boolean;
  /** 3D building blocks from z15; default on. */
  buildings3d?: boolean;
  /** The camera follows the walker (false once the pilgrim has panned, pinched or rotated the map). Default true. */
  follow?: boolean;
  /** Bearing follows the direction of travel (true, default) or stays north-up. */
  headingUp?: boolean;
  /** Smoothed direction of travel: the arrow on the puck and the heading-up bearing. */
  headingDeg?: number | null;
  /** Route from the walker to the end of the stage (drawn as the bold dotted line). */
  ahead?: LngLat[];
  /** Route after the end of the stage (drawn faint). */
  beyond?: LngLat[];
  /** The red pin: end of the current stage. */
  stageEnd?: { at: LngLat; name: string } | null;
  /** Pin kinds to show; undefined = all. */
  poiKinds?: PoiKind[];
  /** The pilgrim moved the map by hand (false) / the camera follows again (true). */
  onFollowChange?: (follow: boolean) => void;
  /** Map bearing in degrees, for the compass button. */
  onBearingChange?: (bearing: number) => void;
};
