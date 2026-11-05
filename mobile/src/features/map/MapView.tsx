// Entry point for the map. MapLibre is a native module: it exists in a dev build or
// store build, but not in Expo Go or on web. There we fall back to the stylised SVG
// map so the rest of the app can still be clicked through.
import { ComponentType } from 'react';
import { TurboModuleRegistry, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/AppText';
import { MapCanvas } from '@/features/MapCanvas';
import { c, radius } from '@/theme';
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
  return (
    <View style={{ flex: 1 }}>
      <MapCanvas layer={props.layer} width={width} height={height} />
      <View style={{ position: 'absolute', top: props.insets.top + 64, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.red100 }}>
        <AppText variant="caption" color={c.red700}>Preview map. The real map needs the dev build.</AppText>
      </View>
    </View>
  );
}
