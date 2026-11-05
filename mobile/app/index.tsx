import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';

// Entry point: send people to the right place for their account state.
export default function Index() {
  const { session, journey } = useAuth();
  if (!session) return <Redirect href="/welcome" />;
  if (!journey) return <Redirect href="/onboarding" />;
  return <Redirect href="/me" />;
}
