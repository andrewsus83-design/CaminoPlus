// The one icon the shared Icon set does not have: a phone handset for "Call 112". Same 24 px outline style.
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export function PhoneIcon({ color, size = 24, strokeWidth = 1.9, filled }: { color: string; size?: number; strokeWidth?: number; filled?: boolean }) {
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M6.7 3.4 4.4 5.7c-.8.8-1 2-.5 3 2 5 6 9 11 11 1 .4 2.2.2 3-.5l2.3-2.3c.5-.5.5-1.3 0-1.8l-2.8-2.2c-.5-.4-1.2-.4-1.7.1l-1.1 1.1c-2.1-.9-3.8-2.6-4.7-4.7l1.1-1.1c.5-.5.5-1.2.1-1.7L8.5 3.4c-.5-.5-1.3-.5-1.8 0Z"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill={filled ? color : 'none'}
        />
      </Svg>
    </View>
  );
}
