import type { LngLat } from './geo';
import type { TileSource } from './style';

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
  /** Bumped by "locate me" to re-centre the camera. */
  recenterKey: number;
  selectedPoiId?: string;
  onSelectPoi: (id: string | undefined) => void;
  saver: boolean;
  /** Screen space covered by the sheet and tab bar, kept clear by the camera. */
  insets: { top: number; bottom: number };
};
