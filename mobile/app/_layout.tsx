import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { Caveat_700Bold } from '@expo-google-fonts/caveat';
import { AuthProvider, useAuth } from '@/lib/auth';
import { setMapSession } from '@/features/map';
import { supabase } from '@/lib/supabase';
import { role } from '@/theme';

SplashScreen.preventAutoHideAsync();

// The map module gets the login token through this one function (offline pack downloads).
setMapSession({ getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null });

export default function RootLayout() {
  const [loaded, error] = useFonts({ Fraunces_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, JetBrainsMono_400Regular, Caveat_700Bold });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// Route guard: signed out -> (auth); signed in without a journey -> onboarding;
// otherwise the app. auth-callback and reset-password are always reachable.
function RootStack() {
  const { ready, session, journey } = useAuth();
  useEffect(() => { if (ready) SplashScreen.hideAsync(); }, [ready]);
  if (!ready) return null;
  const signedIn = !!session;
  const onboarded = signedIn && !!journey;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: role.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth-callback" />
      <Stack.Screen name="reset-password" />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="stay/[id]" />
        <Stack.Screen name="write" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="offline-maps" />
        <Stack.Screen name="change-camino" />
        <Stack.Screen name="business/index" />
        <Stack.Screen name="business/register" />
        <Stack.Screen name="business/status" />
        <Stack.Screen name="business/dashboard" />
      </Stack.Protected>
    </Stack>
  );
}
