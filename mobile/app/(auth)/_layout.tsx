import { Stack } from 'expo-router';
import { role } from '@/theme';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: role.bg } }} />;
}
