import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { Choice, routeMeta } from '@/components/auth/Choice';
import { RouteGuideCard } from '@/components/auth/RouteGuideCard';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field, FormMessage } from '@/components/auth/Field';
import { useAuth } from '@/lib/auth';
import { listRoutes, listStages, Route, Stage, startJourney, updateProfile } from '@/lib/api';
import { uuid } from '@/lib/uuid';
import { stageMeta } from '@/features/me/plan';
import { layout, role, space } from '@/theme';

type Step = 'name' | 'route' | 'stage';

export default function Onboarding() {
  const { session, profile, refresh, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState(profile?.display_name ?? '');
  // The name can arrive a moment after this screen opens (Sign in with Apple saves Apple's name, then reloads the
  // profile): take it, unless the pilgrim has already typed something else.
  const [shownName, setShownName] = useState(profile?.display_name ?? '');
  useEffect(() => {
    const fresh = profile?.display_name ?? '';
    if (fresh === shownName) return;
    setShownName(fresh);
    setName((typed) => (typed === shownName ? fresh : typed));
  }, [profile?.display_name, shownName]);
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

  const uid = session?.user.id;
  // One id per (route, stage) choice: if the connection drops mid-request and the pilgrim taps again,
  // the server returns the same journey instead of creating a second one.
  const attemptId = useMemo(() => uuid(), [route?.id, stageId]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = async () => {
    setError(null);
    if (!uid) return;
    try {
      if (step === 'name') {
        if (name.trim() && name.trim() !== profile?.display_name) { setBusy(true); await updateProfile(uid, { display_name: name.trim() }); }
        setStep('route');
      } else if (step === 'route') {
        if (!route) return setError('Pick the Camino you are walking.');
        setStep('stage');
      } else if (route && stages) {
        setBusy(true);
        await startJourney({ route, startStageId: stageId, startDate: null, journeyId: attemptId });
        await refresh(); // the route guard now opens the app
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stepNo = step === 'name' ? 1 : step === 'route' ? 2 : 3;
  const footer = (
    <View style={{ gap: space[3], paddingBottom: insets.bottom ? 0 : space[2] }}>
      <Pill label={step === 'stage' ? 'Start my Camino' : 'Continue'} onPress={next} loading={busy} disabled={step === 'stage' && !stages} />
      {step === 'name' ? (
        <Pill variant="ghost" label="Sign out" onPress={signOut} />
      ) : (
        <Pill variant="ghost" label="Back" onPress={() => setStep(step === 'stage' ? 'route' : 'name')} />
      )}
    </View>
  );

  return (
    <AuthShell back={false} footer={footer}
      title={step === 'name' ? 'Hola, pilgrim' : step === 'route' ? 'Which Camino?' : 'Where do you start?'}
      lead={step === 'name' ? 'What should other pilgrims call you?' : step === 'route' ? 'Pick the Camino you are starting with. You can switch to another Camino anytime inside the app (Settings, My Camino).' : 'Pick your first stage. Your day plan follows the official stages from there.'}>
      <AppText variant="mono" muted style={{ marginTop: -space[2] }}>STEP {stepNo} OF 3</AppText>
      {!!error && <FormMessage>{error}</FormMessage>}

      {step === 'name' && (
        <Field label="Display name" value={name} onChangeText={setName} placeholder="Ana Torres" maxLength={60} autoComplete="name" />
      )}

      {step === 'route' && (routes ? (
        routes.length ? routes.map((r) => (
          <View key={r.id} style={{ gap: space[3] }}>
            <Choice title={r.name} accent={r.color} selected={route?.id === r.id} onPress={() => setRoute(r)}
              meta={routeMeta(r)} />
            {route?.id === r.id && <RouteGuideCard slug={r.slug} stageCount={r.stage_count} />}
          </View>
        )) : <FormMessage tone="info">No routes are published yet.</FormMessage>
      ) : <ActivityIndicator color={role.action} style={{ marginTop: layout.stackGap }} />)}

      {step === 'stage' && (stages ? (
        stages.length ? stages.map((s) => (
          <Choice key={s.id} title={`Stage ${s.stage_number}`} selected={stageId === s.id} onPress={() => setStageId(s.id)}
            meta={stageMeta(s)} />
        )) : (
          <FormMessage tone="info">{`Stages for ${route?.name ?? 'this route'} are coming soon. We will start you at the beginning and fill in your plan when they are ready.`}</FormMessage>
        )
      ) : <ActivityIndicator color={role.action} style={{ marginTop: layout.stackGap }} />)}

      {step === 'stage' && !!stages?.length && (
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>More stages are being added to the app every week.</AppText>
      )}
    </AuthShell>
  );
}
