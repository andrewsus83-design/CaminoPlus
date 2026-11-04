import { Text, TextProps } from 'react-native';
import { role, textStyle, TextVariant } from '@/theme';

type Props = TextProps & { variant?: TextVariant; muted?: boolean; color?: string };

export function AppText({ variant = 'body', muted, color, style, ...rest }: Props) {
  return <Text {...rest} style={[textStyle(variant), { color: color ?? (muted ? role.muted : role.text) }, style]} />;
}
