import type { useRouter } from 'expo-router';

type AppRouter = ReturnType<typeof useRouter>;

/** Back, or the Me tab when this screen was opened directly (a link, a notification) and there is no screen behind it. */
export function goBack(router: AppRouter) {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/me');
}
