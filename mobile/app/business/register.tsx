import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { BackButton } from '@/components/BackButton';
import { Card, Chip, IconButton } from '@/components/ui';
import { Badge, Field, OptionCard, Row, StepBar } from '@/features/business/ui';
import { Sheet } from '@/features/business/BusinessCard';
import { ownerStore } from '@/features/business/store';
import { emailListingDetails } from '@/features/business/contact';
import { amenityOptions, bookingOptions, businessTypes, Draft, proofKinds } from '@/data/business';
import { tints } from '@/data/mock';
import { c, radius, role, space } from '@/theme';

const STEPS = ['Type', 'Name and location', 'Photos and details', 'Prices and booking', 'Proof of ownership'] as const;

// Five-step registration. Listings are not live yet, so the last step emails the details to the team
// (features/business/contact.ts). Later this writes a draft to business_listings (+ photos,
// verifications) and calls submit_business_listing.
export default function BusinessRegister() {
  const router = useRouter();
  const saved = ownerStore.get();
  const [step, setStep] = useState(Math.min(saved.stepsDone + 1, 5));
  const [d, setD] = useState<Draft>(saved.draft);
  const [err, setErr] = useState(false);
  const [exitAsk, setExitAsk] = useState(false);
  const [sending, setSending] = useState(false);
  const toast = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => setErr(false), [d, step]);
  const showToast = () => Animated.sequence([
    Animated.timing(toast, { toValue: 1, duration: 200, useNativeDriver: true }),
    Animated.delay(1100),
    Animated.timing(toast, { toValue: 0, duration: 200, useNativeDriver: true }),
  ]).start();
  const doShake = () => Animated.sequence([10, -10, 6, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 70, useNativeDriver: true }))).start();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const toggle = (k: 'amenities' | 'booking', v: string) => set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v]);

  const ready = [
    !!d.type,
    d.name.trim().length > 1 && d.address.trim().length > 3,
    d.photos.length >= 3,
    d.booking.length > 0,
    d.taxId.trim().length > 3 && !!d.proof,
  ][step - 1];

  const errText = ['Pick one to continue', 'Add the name on your door and the address', 'Add at least 3 photos', 'Turn on at least one way to book', 'Add your tax ID and one document'][step - 1];
  const next = () => {
    if (!ready) { setErr(true); doShake(); return; }
    ownerStore.saveDraft(d, step);
    if (step < STEPS.length) { setStep(step + 1); showToast(); return; }
    setSending(true);
    // Listings are not live yet: really send the owner's details to the team by email.
    void emailListingDetails(d).then((sent) => { setSending(false); if (sent) { ownerStore.submit(); router.replace('/business/status'); } });
  };
  const back = () => (step > 1 ? setStep(step - 1) : router.back());

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <BackButton onPress={back} />
        <AppText variant="mono" muted style={{ marginLeft: 'auto' }}>Step {step} of {STEPS.length}</AppText>
        <IconButton name="close" label="Close" onPress={() => setExitAsk(true)} />
      </View>
      <StepBar step={step} total={STEPS.length} />

      {step === 1 && (
        <>
          <AppText variant="h2">What kind of place do you run?</AppText>
          <AppText variant="body" muted>Pick the closest one. You can add more places later.</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
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
          <View style={{ height: 160, borderRadius: radius.lg, backgroundColor: role.bg, borderWidth: 1, borderColor: role.border, alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
            <Icon name="pin" color={role.danger} size={32} />
            <AppText variant="caption" muted>Map pin preview · drag it to your door (MapLibre in the dev build)</AppText>
          </View>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: c.blue50 }}>
            <Icon name="flag" color={role.action} />
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {d.photos.map((t, i) => (
              <Pressable key={i} accessibilityLabel="Remove photo" onPress={() => set('photos', d.photos.filter((_, j) => j !== i))}
                style={{ width: '31.5%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: t, justifyContent: 'flex-end', padding: space[2] }}>
                {i === 0 && <Badge label="Cover" />}
              </Pressable>
            ))}
            <Pressable accessibilityLabel="Add photo" onPress={() => set('photos', [...d.photos, tints[d.photos.length % tints.length]])}
              style={{ width: '31.5%', aspectRatio: 1, borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: role.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
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
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <View style={{ flex: 1 }}><Field label="Dorm bed (€)" keyboardType="numeric" value={d.priceBed} onChangeText={(v) => set('priceBed', v)} placeholder="14" /></View>
            <View style={{ flex: 1 }}><Field label="Private room (€)" keyboardType="numeric" value={d.priceRoom} onChangeText={(v) => set('priceRoom', v)} placeholder="42" /></View>
          </View>
          <AppText variant="label">How pilgrims book</AppText>
          <Card style={{ padding: space[1] }}>
            {bookingOptions.map((b, i) => {
              const on = d.booking.includes(b.id);
              return (
                <Pressable key={b.id} disabled={b.soon} onPress={() => toggle('booking', b.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: space[4], borderTopWidth: i ? 1 : 0, borderTopColor: role.border, opacity: b.soon ? 0.55 : 1 }}>
                  <AppText variant="label" style={{ flex: 1 }}>{b.title}</AppText>
                  {b.soon ? <Badge label="Soon" tone="gold" /> : (
                    <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: on ? role.action : 'transparent', borderWidth: on ? 0 : 2, borderColor: role.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Icon name="check" color={role.onAction} size={18} />}
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
                style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[4], borderRadius: radius.lg, borderWidth: 2, borderStyle: on ? 'solid' : 'dashed', borderColor: on ? c.success : role.borderStrong, backgroundColor: on ? c.successWash : 'transparent' }}>
                <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: on ? c.success : role.sunken, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={on ? 'check' : 'camera'} color={on ? role.onDanger : role.text} size={20} />
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

      {err && (
        <Animated.View style={{ transform: [{ translateX: shake }] }}>
          <AppText variant="label" color={c.red700}>{errText}</AppText>
        </Animated.View>
      )}
      <View style={{ flexDirection: 'row', gap: space[3], marginTop: space[2] }}>
        {step > 1 && <View style={{ flex: 1 }}><Pill variant="ghost" label="Back" onPress={back} /></View>}
        <View style={{ flex: 1, opacity: ready ? 1 : 0.45 }}>
          {sending ? (
            <View style={{ height: 56, borderRadius: radius.pill, backgroundColor: role.highlight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
              <ActivityIndicator color={role.onHighlight} /><AppText variant="label" color={role.onHighlight}>Sending…</AppText>
            </View>
          ) : (
            <Pill variant={step === STEPS.length ? 'gold' : 'primary'} label={step === STEPS.length ? 'Email my details' : 'Continue'} onPress={next} />
          )}
        </View>
      </View>
    </Screen>
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: space[16], alignSelf: 'center', opacity: toast, transform: [{ translateY: toast.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }], flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], height: 40, borderRadius: radius.pill, backgroundColor: role.action }}>
      <Icon name="check" color={role.onAction} size={18} /><AppText variant="label" color={role.onAction}>Draft saved</AppText>
    </Animated.View>
    <Sheet visible={exitAsk} onClose={() => setExitAsk(false)}>
      <AppText variant="h3">Save and finish later?</AppText>
      <AppText variant="body" muted>Your draft stays on this phone and in your account. Pick up where you left off from Settings.</AppText>
      <Pill label="Save draft" onPress={() => { ownerStore.saveDraft(d, step - 1); setExitAsk(false); router.back(); }} />
      <Pressable onPress={() => setExitAsk(false)} style={{ alignItems: 'center', justifyContent: 'center', minHeight: 48 }}><AppText variant="label" muted>Keep going</AppText></Pressable>
    </Sheet>
    </View>
  );
}
