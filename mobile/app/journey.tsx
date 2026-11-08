import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { BackButton } from '@/components/BackButton';
import { Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMeData } from '@/lib/useMeData';
import { c, layout, radius, role, space } from '@/theme';

// Your walk from 0 km to where you are now, day by day.
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not set');
const fmtKm = (n: number) => (Math.round(n * 10) / 10).toString();

function pace(km: number, start: string | null, end: string | null) {
  if (!start || !end || km <= 0) return null;
  const hours = (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
  if (hours <= 0 || hours > 20) return null;
  const minPerKm = (hours * 60) / km;
  const m = Math.floor(minPerKm);
  return `${m}:${String(Math.round((minPerKm - m) * 60)).padStart(2, '0')} min/km · ${(km / hours).toFixed(1)} km/h`;
}

export default function Journey() {
  const insets = useSafeAreaInsets();
  const { journey } = useAuth();
  const { days } = useMeData();
  const done = (days ?? []).filter((d) => d.status === 'done');
  let at = 0;
  const legs = done.map((d) => {
    const km = Number(d.actual_distance_km ?? d.planned_distance_km ?? 0);
    const leg = { d, km, from: at, to: at + km };
    at += km;
    return leg;
  });
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + space[10], gap: layout.stackGap }}>
        <BackButton fallback="/me" />
        <View style={{ gap: space[2] }}>
          <AppText variant="h2">My journey</AppText>
          <AppText variant="lead" muted>{journey?.route?.name ?? 'Your Camino'} · {fmtKm(at)} km walked</AppText>
        </View>
        {days && legs.length === 0 && (
          <Card><AppText variant="small" muted>No finished days yet. When you complete a stage it appears here, from 0 km onward, with where you walked, when and your pace.</AppText></Card>
        )}
        <View>
          {legs.map(({ d, km, from, to }, i) => {
            const story = d.notes?.trim() || `Walked ${fmtKm(km)} km from ${d.from_name ?? 'the start'} to ${d.to_name ?? 'the next town'}.`;
            const p = pace(km, d.started_at, d.finished_at);
            return (
              <View key={d.id} style={{ flexDirection: 'row', gap: space[4] }}>
                <View style={{ alignItems: 'center', width: 36 }}>
                  <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.success, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" color={role.surface} size={20} />
                  </View>
                  {i < legs.length - 1 && <View style={{ width: 3, flex: 1, minHeight: 28, backgroundColor: c.success }} />}
                </View>
                <Card style={{ flex: 1, gap: space[2], marginBottom: space[4] }}>
                  <AppText variant="mono" muted style={{ textTransform: 'uppercase' }}>{fmtKm(from)} → {fmtKm(to)} km · Day {d.day_number}</AppText>
                  <AppText variant="label">{d.from_name ?? 'Start'} → {d.to_name ?? 'Next town'}</AppText>
                  <AppText variant="small" muted>{story}</AppText>
                  <View style={{ marginTop: space[1], gap: space[1] }}>
                    <AppText variant="caption" muted>When: {fmtDate(d.finished_at ?? d.planned_date)}</AppText>
                    <AppText variant="caption" muted>Pace: {p ?? 'not recorded'}</AppText>
                  </View>
                </Card>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
