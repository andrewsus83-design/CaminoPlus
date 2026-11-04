import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';

export default function Settings() {
  return (
    <Screen>
      <AppText variant="h2">Settings</AppText>
      <AppText muted>Billing, password, and smartwatch.</AppText>
    </Screen>
  );
}
