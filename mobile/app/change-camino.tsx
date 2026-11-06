import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { AuthShell } from '@/components/auth/AuthShell';
import { Choice, routeMeta } from '@/components/auth/Choice';
import { FormMessage } from '@/components/auth/Field';
import { useAuth } from '@/lib/auth';
import { listRoutes, listStages, Route, Stage, startJourney } from '@/lib/api';
import { RouteGuideCard } from '@/components/auth/RouteGuideCard';
import { uuid } from '@/lib/uuid';
import { layout, role } from '@/theme';

/** Switch to another Camino from inside the app. Starts a new journey; the old one is kept. */
export default function ChangeCamino() {
  const router = useRouter();
  const { session, journey, refresh } = useAuth();
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listRoutes().then(setRoutes).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!route) return;
    setStages(null); setStageId(null);
    listStages(route.id).then((s) => { setStages(s); setStageId(s[0]?.id ?? null); }).catch((e) => setError(e.message));
  }, [route]);

  const attemptId = useMemo(() => uuid(), [route?.id, stageId]); // same id on a retry of the same choice
  const start = async () => {
    if (!session || !route || !stages) return;
    setBusy(true); setError(null);
    try {
      await startJourney({ route, startStageId: stageId, startDate: null, journeyId: attemptId });
      await refresh();
      router.replace('/(tabs)/me');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <AuthShell hero title="Change Camino" lead={journey?.route ? `You are walking ${journey.route.name}. Pick another Camino any time; your stamps and posts stay with you.` : 'Pick the Camino you want to walk. You can switch again any time.'}
      footer={<Pill large label={route ? `Switch to ${route.short_name ?? route.name}` : 'Pick a Camino'} onPress={start} loading={busy} disabled={!route || !stages} />}>
      {!!error && <FormMessage>{error}</FormMessage>}
      {routes ? routes.map((r) => (
        <View key={r.id} style={{ gap: 12 }}>
          <Choice title={r.name} accent={r.color} selected={route?.id === r.id} onPress={() => setRoute(r)} meta={routeMeta(r)} />
          {route?.id === r.id && <RouteGuideCard slug={r.slug} stageCount={r.stage_count} />}
          {route?.id === r.id && stages && stages.length > 0 && (
            <View style={{ gap: 8, paddingLeft: 12 }}>
              <AppText variant="label">Start at</AppText>
              {stages.map((s) => (
                <Choice key={s.id} title={`Stage ${s.stage_number}`} selected={stageId === s.id} onPress={() => setStageId(s.id)}
                  meta={`${s.start?.name && s.end?.name ? `${s.start.name} to ${s.end.name}` : s.name} · ${Number(s.distance_km).toFixed(1)} km`} />
              ))}
            </View>
          )}
          {route?.id === r.id && stages && stages.length === 0 && (
            <FormMessage tone="info">Stages for this Camino are coming soon. We will start you at the beginning and fill in your plan when they are ready.</FormMessage>
          )}
        </View>
      )) : <ActivityIndicator color={role.action} style={{ marginTop: layout.stackGap }} />}
    </AuthShell>
  );
}
