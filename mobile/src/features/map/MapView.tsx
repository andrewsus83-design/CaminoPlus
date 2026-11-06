// Entry point for the map. MapLibre is a native module: it exists in a dev build or
// store build, but not in Expo Go or on web. There we fall back to the stylised SVG
// preview (MapCanvas) so the rest of the app, including the whole Walk view overlay, can still be clicked through.
import { ComponentType } from 'react';
import { TurboModuleRegistry, useWindowDimensions } from 'react-native';
import { MapCanvas } from '@/features/MapCanvas';
import type { MapViewProps } from './types';

export const nativeMapAvailable = (() => {
  try {
    return TurboModuleRegistry.get('MLRNLogModule') != null;
  } catch {
    return false;
  }
})();

// Lazy require: importing MapLibre in Expo Go throws at import time.
const LiveMap: ComponentType<MapViewProps> | null = nativeMapAvailable ? require('./LiveMap').LiveMap : null;

export function MapView(props: MapViewProps) {
  const { width, height } = useWindowDimensions();
  if (LiveMap) return <LiveMap {...props} />;
  return <MapCanvas {...props} width={width} height={height} />;
}
