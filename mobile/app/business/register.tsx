import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, Chip, IconButton } from '@/components/ui';
import { Badge, Field, OptionCard, Row, StepBar } from '@/features/business/ui';
import { amenityOptions, bookingOptions, businessTypes, Draft, emptyDraft, proofKinds } from '@/data/business';
import { tints } from '@/data/mock';
import { c, radius, role } from '@/theme';

const STEPS = ['Type', 'Name and location', 'Photos and details', 'Prices and booking', 'Proof of ownership'] as const;

// Five-step registration. Sample state only; later this writes a draft to
// business_listings (+ photos, verifications) and calls submit_business_listing.
export default function BusinessRegister() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [d, setD] = useState<Draft>(emptyDraft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const toggle = (k: 'amenities' | 'booking', v: string) => set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v]);

  const ready = [
    true,
    d.name.trim().length > 1 && d.address.trim().length > 3,
    d.photos.length >= 3,
    d.booking.length > 0,
    d.taxId.trim().length > 3 && !!d.proof,
  ][step - 1];

  const next = () => (step < STEPS.length ? setStep(step + 1) : router.replace('/business/status'));
  const back = () => (step > 1 ? setStep(step - 1) : router.back());

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton name="back" label="Back" onPress={back} flat />
        <AppText variant="mono" muted style={{ marginLeft: 'auto', fontSize: 13 }}>Step {step} of {STEPS.length}</AppText>
      </View>
      <StepBar step={step} total={STEPS.length} />

      {step === 1 && (
        <>
          <AppText variant="h2">What kind of place do you run?</AppText>
          <AppText variant="body" muted>Pick the closest one. You can add more places later.</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {businessTypes.map((t) => (
              <OptionCard key={t.id} title={t.title} hint={t.hint} icon={t.icon} selected={d.type === t.id} onPress={() => set('type', t.id)} style={{ width: '47.5%' }} />
            ))}
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <AppText variant="h2">Where are you on the Way?</AppText>
          <Field label="Name pilgrims will see" value={d.name} onChangeText={(v) => set('name', v)} placeholder="e.g. Albergue Casa Ana" />
          <Field label="Address" value={d.address} onChangeText={(v) => set('address', v)} placeholder="Street, number, town" />
          <View style={{ height: 160, borderRadius: radius.lg, backgroundColor: c.sand100, borderWidth: 1, borderColor: role.border, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="pin" color={c.red} size={40} />
            <AppText variant="caption" muted>Map pin preview · drag it to your door (MapLibre in the dev build)</AppText>
          </View>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.blue50 }}>
            <Icon name="flag" color={c.blue} />
            <View style={{ flex: 1 }}>
              <AppText variant="label">Camino Francés · stage 14</AppText>
              <AppText variant="caption" muted>On the route · 40 m from the yellow arrows</AppText>
            </View>
          </Card>
        </>
      )}

      {step === 3 && (
        <>
          <AppText variant="h2">Show pilgrims inside</AppText>
          <AppText variant="body" muted>Add at least 3 photos. The first one is your cover.</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {d.photos.map((t, i) => (
              <Pressable key={i} accessibilityLabel="Remove photo" onPress={() => set('photos', d.photos.filter((_, j) => j !== i))}
                style={{ width: '31.5%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: t, justifyContent: 'flex-end', padding: 6 }}>
                {i === 0 && <Badge label="Cover" />}
              </Pressable>
            ))}
            <Pressable accessibilityLabel="Add photo" onPress={() => set('photos', [...d.photos, tints[d.photos.length % tints.length]])}
              style={{ width: '31.5%', aspectRatio: 1, borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: c.sand400, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" color={role.muted} />
            </Pressable>
          </View>
          <AppText variant="label">Amenities</AppText>
          <Row>{amenityOptions.map((a) => <Chip key={a} label={a} selected={d.amenities.includes(a)} onPress={() => toggle('amenities', a)} />)}</Row>
          <Field label="Opening or check-in hours" value={d.hours} onChangeText={(v) => set('hours', v)} />
        </>
      )}

      {step === 4 && (
        <>
          <AppText variant="h2">Prices and how to book</AppText>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Field label="Dorm bed (€)" keyboardType="numeric" value={d.priceBed} onChangeText={(v) => set('priceBed', v)} placeholder="14" /></View>
            <View style={{ flex: 1 }}><Field label="Private room (€)" keyboardType="numeric" value={d.priceRoom} onChangeText={(v) => set('priceRoom', v)} placeholder="42" /></View>
          </View>
          <AppText variant="label">How pilgrims book</AppText>
          <Card style={{ padding: 4 }}>
            {bookingOptions.map((b, i) => {
              const on = d.booking.includes(b.id);
              return (
                <Pressable key={b.id} disabled={b.soon} onPress={() => toggle('booking', b.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: role.border, opacity: b.soon ? 0.55 : 1 }}>
                  <AppText variant="label" style={{ flex: 1 }}>{b.title}</AppText>
                  {b.soon ? <Badge label="Soon" tone="gold" /> : (
                    <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: on ? c.blue : 'transparent', borderWidth: on ? 0 : 2, borderColor: c.sand400, alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Icon name="check" color={c.parchment} size={16} />}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </Card>
          <AppText variant="small" muted>Every stay shows its booking method, so pilgrims know what to expect.</AppText>
        </>
      )}

      {step === 5 && (
        <>
          <AppText variant="h2">Show us it's yours</AppText>
          <AppText variant="body" muted>Only the CaminoPlus team sees these files. They are never shown to pilgrims.</AppText>
          <Field label="Business or tax ID (NIF / CIF)" value={d.taxId} onChangeText={(v) => set('taxId', v)} placeholder="B12345678" autoCapitalize="characters" />
          <AppText variant="label">Upload one document</AppText>
          {proofKinds.map((k) => {
            const on = d.proof === k;
            return (
              <Pressable key={k} onPress={() => set('proof', on ? null : k)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 2, borderStyle: on ? 'solid' : 'dashed', borderColor: on ? c.success : c.sand400, backgroundColor: on ? c.successWash : 'transparent' }}>
                <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: on ? c.success : c.sand200, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={on ? 'check' : 'camera'} color={on ? c.white : role.text} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{k}</AppText>
                  <AppText variant="caption" muted>{on ? 'Uploaded · tap to remove' : 'Photo or PDF, up to 10 MB'}</AppText>
                </View>
              </Pressable>
            );
          })}
          <AppText variant="small" muted>By sending you accept the Business terms.</AppText>
        </>
      )}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        {step > 1 && <View style={{ flex: 1 }}><Pill variant="ghost" label="Back" onPress={back} /></View>}
        <View style={{ flex: 1, opacity: ready ? 1 : 0.45 }}>
          <Pill variant={step === STEPS.length ? 'gold' : 'primary'} label={step === STEPS.length ? 'Send for review' : 'Continue'} onPress={ready ? next : undefined} />
        </View>
      </View>
    </Screen>
  );
}
