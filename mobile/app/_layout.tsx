import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { Caveat_700Bold } from '@expo-google-fonts/caveat';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AccountUnavailable } from '@/components/AccountUnavailable';
import { setMapSession } from '@/features/map';
import { supabase } from '@/lib/supabase';
import { ThemeProvider, consumeReturnToSettings, useTheme } from '@/lib/theme';
import { role } from '@/theme';

SplashScreen.preventAutoHideAsync();

// The map module gets the login token through this one function (offline pack downloads).
setMapSession({ getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null });

export default function RootLayout() {
  const [loaded, error] = useFonts({ Fraunces_600SemiBold, Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, JetBrainsMono_400Regular, Caveat_700Bold });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Themed />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// Colours are read while rendering, so a theme change remounts the stack (key). Login state lives above and stays.
function Themed() {
  const { scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <RootStack key={scheme} />
    </>
  );
}

// Route guard: signed out -> (auth); signed in without a journey -> onboarding;
// otherwise the app. auth-callback and reset-password are always reachable.
// A load error is NOT "no journey": see AccountUnavailable and lib/auth.tsx.
function RootStack() {
  const { ready, status, session, journey, accountError, retry, signOut } = useAuth();
  const router = useRouter();
  // Right after a theme switch the stack was remounted: return to Settings, with Me underneath it so Back still works.
  // A moment later, once the new stack has mounted; if navigating still fails the person stays on Me, never a red screen.
  useEffect(() => {
    if (!consumeReturnToSettings()) return;
    setTimeout(() => { try { router.replace('/me'); router.push('/settings'); } catch { /* stay on Me */ } }, 0);
  }, [router]);
  const splashHidden = useRef(false);
  useEffect(() => { if (ready) { splashHidden.current = true; SplashScreen.hideAsync(); } }, [ready]);
  if (!ready) {
    // First launch: the native splash is still showing. Later (right after sign-in) show a spinner instead of a blank screen.
    return splashHidden.current ? <View style={{ flex: 1, backgroundColor: role.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={role.action} /></View> : null;
  }
  // Signed in, but the account could not be loaded and nothing is saved on this phone: say so, never guess "onboarding".
  if (session && status !== 'ready') {
    return <AccountUnavailable message={accountError} busy={status === 'loading'} onRetry={() => void retry()} onSignOut={() => void signOut()} />;
  }
  const signedIn = !!session;
  const onboarded = signedIn && !!journey;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: role.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth-callback" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="licences" />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="delete-account" />
        <Stack.Screen name="download-data" />
        <Stack.Screen name="feedback" />
        <Stack.Screen name="help" />
        <Stack.Screen name="rate" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="diary/index" />
        <Stack.Screen name="diary/[id]" />
        <Stack.Screen name="library/bookmarks" />
        <Stack.Screen name="library/daily" />
        <Stack.Screen name="library/bible/[code]/index" />
        <Stack.Screen name="library/bible/[code]/[chapter]" />
        <Stack.Screen name="stay/[id]" />
        <Stack.Screen name="write" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="chat/new" />
        <Stack.Screen name="chat/new-group" />
        <Stack.Screen name="chat/info/[id]" />
        <Stack.Screen name="offline-maps" />
        <Stack.Screen name="change-camino" />
        <Stack.Screen name="planner" />
        <Stack.Screen name="watches" />
        <Stack.Screen name="edit-account" />
        <Stack.Screen name="journey" />
        <Stack.Screen name="passport" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="blocked" />
        <Stack.Screen name="business/index" />
        <Stack.Screen name="business/register" />
        <Stack.Screen name="business/status" />
        <Stack.Screen name="business/dashboard" />
      </Stack.Protected>
    </Stack>
  );
}
