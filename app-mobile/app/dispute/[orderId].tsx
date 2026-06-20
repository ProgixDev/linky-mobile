import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Input } from '../../src/components/primitives/Input';
import { Button } from '../../src/components/primitives/Button';
import { ProgressDots } from '../../src/components/primitives/ProgressDots';
import { TopBar } from '../../src/components/nav/TopBar';
import { StickyBottom } from '../../src/components/nav/StickyBottom';
import { I, type IconKey } from '../../src/icons/Icon';
import { useToast } from '../../src/components/feedback/Toast';
import { useOrder, useDisputeOrder, type DisputeReason } from '../../src/data/queries';

interface IssueDef {
  id: DisputeReason;
  labelKey: string;
  icon: IconKey;
}

// Phase I.8 — labelKey only ; resolve at render so the rows flip on language
// switch.
const ISSUE_DEFS: IssueDef[] = [
  { id: 'not_received', labelKey: 'dispute.reason.notReceived', icon: 'package' },
  { id: 'wrong',        labelKey: 'dispute.reason.wrong',        icon: 'warn'    },
  { id: 'damaged',      labelKey: 'dispute.reason.damaged',      icon: 'trash'   },
];

export default function DisputeRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const [issue, setIssue] = useState<DisputeReason | null>(null);
  const [description, setDescription] = useState('');
  const { show } = useToast();
  const { data: order } = useOrder(orderId);
  const dispute = useDisputeOrder();
  const canSubmit = !!issue && !!order && !dispute.isPending;
  const ISSUES = useMemo(
    () => ISSUE_DEFS.map((d) => ({ ...d, label: t(d.labelKey) })),
    [t],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('dispute.topbar')} back subtitle={t('dispute.orderRef', { ref: orderId })} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <ProgressDots total={4} current={0} />
        <Text variant="dispL" style={{ fontSize: 20, marginTop: 14, marginBottom: 14 }}>
          {t('dispute.title')}
        </Text>

        {ISSUES.map((o) => {
          const sel = issue === o.id;
          const Icon = I[o.icon];
          return (
            <Pressable
              key={o.id}
              onPress={() => setIssue(o.id)}
              style={{
                padding: 14,
                borderRadius: radii.lg,
                borderWidth: sel ? 2 : 1,
                borderColor: sel ? colors.danger : colors.border,
                backgroundColor: colors.card,
                marginBottom: 8,
                flexDirection: 'row',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: sel ? 'rgba(209,79,60,0.1)' : colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={17} color={sel ? colors.danger : colors.text} />
              </View>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '500' }}>{o.label}</Text>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  backgroundColor: sel ? colors.danger : 'transparent',
                  borderWidth: sel ? 0 : 1.5,
                  borderColor: colors.borderStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {sel && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
              </View>
            </Pressable>
          );
        })}

        <View style={{ marginTop: 16 }}>
          <Input
            label={t('dispute.descLabel')}
            multiline
            maxLength={500}
            value={description}
            onChangeText={setDescription}
            placeholder={t('dispute.descPlaceholder')}
          />
        </View>

        {/* Phase Finish #6 — the "Photos (optionnel)" label + add-photo box
            never had an onPress / picker / upload : it was a dead control
            promising an attachment that couldn't be sent. Removed for V1.
            When the dispute photo flow lands (V1.1), it ships behind the
            same photo-upload-url path the create wizards use. */}
      </ScrollView>
      <StickyBottom>
        <Button
          variant="destructive"
          size="lg"
          block
          disabled={!canSubmit}
          label={t('dispute.submit')}
          onPress={() => {
            if (!issue || !order) return;
            dispute.mutate(
              { orderId: order.id, reason: issue, note: description.trim() || undefined },
              {
                onSuccess: () => {
                  show(t('dispute.signaled'), 'success');
                  router.replace('/orders');
                },
              },
            );
          }}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
