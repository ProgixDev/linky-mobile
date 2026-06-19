import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Phone, Plus, ShieldCheck, ShieldAlert, Star, Trash2, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { useMyPhones, useRequestAddPhone, useConfirmAddPhone, useRemovePhone, useSetPrimaryPhone, type UserPhone } from '../../src/data/queries';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { haptic } from '../../src/lib/haptics';
import { Skeleton } from '../../src/components/primitives/Skeleton';

// Pre-prod: real multi-phone CRUD. Replaces the X.7 "Bientôt" placeholder.
// Adding a phone goes through OTP verification — see phone-add-request and
// phone-add-confirm for the auth-surface security rationale.

function normalizeGnPhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('224')) d = d.slice(3);
  return d.slice(0, 9);
}
function formatGnPhone(d: string): string {
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}
function formatE164ForDisplay(e164: string): string {
  // Guinea numbers: +224 6XX XX XX XX. Strip the country code and reformat
  // the trailing 9 digits the same way the input field does.
  if (e164.startsWith('+224')) {
    return `+224 ${formatGnPhone(e164.slice(4))}`;
  }
  return e164;
}

export default function PhonesRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const phonesQuery = useMyPhones();
  const removePhone = useRemovePhone();
  const setPrimary = useSetPrimaryPhone();

  const [addOpen, setAddOpen] = useState(false);

  const phones = phonesQuery.data ?? [];

  const onPressRemove = (p: UserPhone) => {
    if (p.is_primary) {
      toast.show(t('settings.phones.cannotRemovePrimary'), 'danger');
      return;
    }
    Alert.alert(
      t('settings.phones.removeTitle'),
      t('settings.phones.removeBody', { phone: formatE164ForDisplay(p.e164) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.phones.removeConfirm'),
          style: 'destructive',
          onPress: () => {
            removePhone.mutate(
              { phoneId: p.id },
              {
                onSuccess: () => toast.show(t('settings.phones.removeOk'), 'success'),
                onError: (e) => toast.show(toToastMessage(e, t('settings.phones.removeError')), 'danger'),
              },
            );
          },
        },
      ],
    );
  };

  const onPressMakePrimary = (p: UserPhone) => {
    if (p.is_primary) return;
    if (!p.verified) {
      toast.show(t('settings.phones.cannotPrimaryUnverified'), 'danger');
      return;
    }
    haptic.light();
    setPrimary.mutate(
      { phoneId: p.id },
      {
        onSuccess: () => toast.show(t('settings.phones.primaryOk'), 'success'),
        onError: (e) => toast.show(toToastMessage(e, t('settings.phones.primaryError')), 'danger'),
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title={t('settings.phones.title')}
          subtitle={t('settings.phones.subtitle')}
        />

        <View style={{ paddingHorizontal: 24 }}>
          {phonesQuery.isLoading ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={68} radius={16} />
              <Skeleton height={68} radius={16} />
            </View>
          ) : phones.length === 0 ? (
            <View
              style={{
                paddingVertical: 30,
                alignItems: 'center',
                gap: 8,
                borderRadius: 18,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.border,
                backgroundColor: colors.card,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  backgroundColor: colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Phone size={20} color={colors.textMuted} strokeWidth={1.75} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                {t('settings.phones.emptyTitle')}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.textMuted,
                  textAlign: 'center',
                  maxWidth: 260,
                  lineHeight: 17,
                }}
              >
                {t('settings.phones.emptyBody')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {phones.map((p) => (
                <PhoneCard
                  key={p.id}
                  phone={p}
                  onMakePrimary={() => onPressMakePrimary(p)}
                  onRemove={() => onPressRemove(p)}
                  busy={removePhone.isPending || setPrimary.isPending}
                />
              ))}
            </View>
          )}

          <View style={{ marginTop: 18 }}>
            <Button
              variant="dark"
              size="lg"
              block
              leading={<Plus size={16} color={colors.bg} strokeWidth={2.25} />}
              label={t('settings.phones.addCta')}
              onPress={() => {
                haptic.light();
                setAddOpen(true);
              }}
            />
          </View>

          <View
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.bgSunken,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <ShieldCheck size={14} color={colors.primary} strokeWidth={2} style={{ marginTop: 1 }} />
            <Text
              style={{
                flex: 1,
                fontSize: 12.5,
                lineHeight: 18,
                color: colors.textMuted,
                letterSpacing: 0,
              }}
            >
              {t('settings.phones.note')}
            </Text>
          </View>
        </View>
      </ScrollView>

      <AddPhoneSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </SafeAreaView>
  );
}

function PhoneCard({
  phone,
  onMakePrimary,
  onRemove,
  busy,
}: {
  phone: UserPhone;
  onMakePrimary: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: phone.is_primary ? colors.primary : colors.border,
        backgroundColor: colors.card,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: colors.bgSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Phone size={16} color={colors.text} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }}>
            {formatE164ForDisplay(phone.e164)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' }}>
            {phone.is_primary && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: colors.primarySoft,
                }}
              >
                <Star size={9} color={colors.primaryDeep} fill={colors.primaryDeep} strokeWidth={2} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primaryDeep, letterSpacing: 0.3 }}>
                  {t('settings.phones.primaryBadge')}
                </Text>
              </View>
            )}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: phone.verified ? colors.accentSoft : colors.bgSunken,
              }}
            >
              {phone.verified ? (
                <ShieldCheck size={9} color={colors.accentText} strokeWidth={2} />
              ) : (
                <ShieldAlert size={9} color={colors.textMuted} strokeWidth={2} />
              )}
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: phone.verified ? colors.accentText : colors.textMuted,
                  letterSpacing: 0.3,
                }}
              >
                {phone.verified ? t('settings.phones.verifiedBadge') : t('settings.phones.unverifiedBadge')}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {!phone.is_primary && (
          <Pressable
            onPress={onMakePrimary}
            disabled={busy || !phone.verified}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy || !phone.verified ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.text }}>
              {t('settings.phones.makePrimary')}
            </Text>
          </Pressable>
        )}
        {!phone.is_primary && (
          <Pressable
            onPress={onRemove}
            disabled={busy}
            style={{
              height: 36,
              paddingHorizontal: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: 'rgba(209,79,60,0.3)',
              backgroundColor: 'rgba(209,79,60,0.06)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Trash2 size={13} color={colors.danger} strokeWidth={2} />
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.danger }}>
              {t('settings.phones.remove')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function AddPhoneSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const requestAdd = useRequestAddPhone();
  const confirmAdd = useConfirmAddPhone();

  const [step, setStep] = useState<'enter' | 'verify'>('enter');
  const [phone, setPhone] = useState('');
  const [otpId, setOtpId] = useState<string | null>(null);
  const [code, setCode] = useState('');

  // Reset state every time the sheet opens — otherwise a previous "Verify"
  // session leaks into the next add attempt.
  useEffect(() => {
    if (open) {
      setStep('enter');
      setPhone('');
      setOtpId(null);
      setCode('');
    }
  }, [open]);

  const phoneValid = useMemo(() => phone.length === 9 && phone.startsWith('6'), [phone]);

  if (!open) return null;

  const onRequest = () => {
    if (!phoneValid || requestAdd.isPending) return;
    const e164 = `+224${phone}`;
    requestAdd.mutate(
      { e164 },
      {
        onSuccess: ({ otp_id, dev_code }) => {
          setOtpId(otp_id);
          setCode(dev_code ?? '');
          setStep('verify');
          toast.show(t('settings.phones.codeSent'), 'info');
        },
        onError: (e) => toast.show(toToastMessage(e, t('settings.phones.requestError')), 'danger'),
      },
    );
  };

  const onConfirm = () => {
    if (!otpId || code.length !== 6 || confirmAdd.isPending) return;
    confirmAdd.mutate(
      { otp_id: otpId, code },
      {
        onSuccess: () => {
          toast.show(t('settings.phones.addOk'), 'success');
          onClose();
        },
        onError: (e) => toast.show(toToastMessage(e, t('settings.phones.confirmError')), 'danger'),
      },
    );
  };

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
      }}
    >
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 32,
            gap: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
              {step === 'enter' ? t('settings.phones.addSheetTitle') : t('settings.phones.verifySheetTitle')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                backgroundColor: colors.bgSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>

          {step === 'enter' ? (
            <>
              <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 18 }}>
                {t('settings.phones.addSheetBody')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  height: 52,
                  gap: 6,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>+224</Text>
                <TextInput
                  value={formatGnPhone(phone)}
                  onChangeText={(txt) => setPhone(normalizeGnPhone(txt))}
                  keyboardType="phone-pad"
                  placeholder="6XX XX XX XX"
                  placeholderTextColor={colors.textFaint}
                  style={{
                    flex: 1,
                    fontSize: 16,
                    color: colors.text,
                    fontVariant: ['tabular-nums'],
                    padding: 0,
                  }}
                />
              </View>
              <Button
                variant="dark"
                size="lg"
                block
                label={t('settings.phones.sendCode')}
                disabled={!phoneValid || requestAdd.isPending}
                loading={requestAdd.isPending}
                onPress={onRequest}
              />
            </>
          ) : (
            <>
              <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 18 }}>
                {t('settings.phones.verifySheetBody', { phone: `+224 ${formatGnPhone(phone)}` })}
              </Text>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  height: 56,
                  justifyContent: 'center',
                }}
              >
                <TextInput
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                  placeholderTextColor={colors.textFaint}
                  style={{
                    fontSize: 22,
                    fontWeight: '700',
                    color: colors.text,
                    fontVariant: ['tabular-nums'],
                    letterSpacing: 6,
                    padding: 0,
                  }}
                />
              </View>
              <Button
                variant="dark"
                size="lg"
                block
                label={t('settings.phones.confirmCode')}
                disabled={code.length !== 6 || confirmAdd.isPending}
                loading={confirmAdd.isPending}
                onPress={onConfirm}
              />
              <Pressable onPress={() => setStep('enter')} hitSlop={6} style={{ alignSelf: 'center' }}>
                <Text style={{ fontSize: 12.5, color: colors.textMuted }}>
                  {t('settings.phones.backToEnter')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
