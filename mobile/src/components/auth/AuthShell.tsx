import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../AppText';
import { IconButton } from '../ui';
import { layout, role } from '@/theme';

/** Spacious form screen with optional back button, title and lead text. */
export function AuthShell({ title, lead, back = true, children, footer }: { title: string; lead?: string; back?: boolean; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: role.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + layout.screenTop, paddingBottom: insets.bottom + 24, paddingHorizontal: layout.screenMargin, gap: 24 }}>
        {back && <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}
        <View style={{ gap: 8, marginTop: back ? 0 : 24 }}>
          <AppText variant="h2">{title}</AppText>
          {!!lead && <AppText variant="lead" muted>{lead}</AppText>}
        </View>
        <View style={{ gap: 18 }}>{children}</View>
        {footer && <View style={{ marginTop: 'auto', gap: 12 }}>{footer}</View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
