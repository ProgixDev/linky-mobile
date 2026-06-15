import { useMemo } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloudOff, Wifi, Image as ImageIcon, Play } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Switch } from '../../src/components/primitives/Switch';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { usePrefs } from '../../src/stores/prefs';

interface ImpactRow {
  Icon: LucideIcon;
  label: string;
  sub: string;
}

export default function DataSaverRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { dataSaver, setDataSaver } = usePrefs();

  // Phase I.3g — IMPACT was module-scope. Memo inside the component on t.
  const IMPACT: ImpactRow[] = useMemo(
    () => [
      { Icon: Play, label: t('settings.dataSaver.row1Title'), sub: t('settings.dataSaver.row1Sub') },
      { Icon: ImageIcon, label: t('settings.dataSaver.row2Title'), sub: t('settings.dataSaver.row2Sub') },
      { Icon: Wifi, label: t('settings.dataSaver.row3Title'), sub: t('settings.dataSaver.row3Sub') },
    ],
    [t],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={t('settings.dataSaver.title')}
        subtitle={t('settings.dataSaver.subtitle')}
      />

      <View style={{ paddingHorizontal: 24, gap: 12 }}>
        {/* Master toggle card */}
        <View
          style={{
            padding: 16,
            borderRadius: 20,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: dataSaver ? colors.primarySoft : colors.bgSunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloudOff
              size={20}
              color={dataSaver ? colors.primary : colors.text}
              strokeWidth={1.75}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: colors.text,
                letterSpacing: 0,
                lineHeight: 18,
                includeFontPadding: false,
              }}
            >
              {t('settings.dataSaver.toggleLabel')}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: colors.textMuted,
                marginTop: 2,
                letterSpacing: 0,
                lineHeight: 15,
              }}
            >
              {dataSaver ? t('settings.dataSaver.on') : t('settings.dataSaver.off')}
            </Text>
          </View>
          <Switch value={dataSaver} onChange={setDataSaver} />
        </View>

        {/* Impact list */}
        <View
          style={{
            borderRadius: 18,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.textFaint,
              letterSpacing: 0.5,
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 6,
            }}
          >
            {t('settings.dataSaver.impactLabel')}
          </Text>
          {IMPACT.map((row, idx) => (
            <View
              key={row.label}
              style={{
                flexDirection: 'row',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: idx < IMPACT.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
                alignItems: 'flex-start',
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                <row.Icon size={14} color={colors.text} strokeWidth={1.75} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13.5,
                    fontWeight: '600',
                    color: colors.text,
                    letterSpacing: 0,
                    lineHeight: 17,
                    includeFontPadding: false,
                  }}
                >
                  {row.label}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textMuted,
                    marginTop: 3,
                    letterSpacing: 0,
                    lineHeight: 17,
                  }}
                >
                  {row.sub}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View
          style={{
            padding: 14,
            borderRadius: 14,
            backgroundColor: colors.bgSunken,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <Wifi size={14} color={colors.info} strokeWidth={2} style={{ marginTop: 1 }} />
          <Text
            style={{
              flex: 1,
              fontSize: 12.5,
              lineHeight: 18,
              color: colors.textMuted,
              letterSpacing: 0,
            }}
          >
            {t('settings.dataSaver.autoNote')}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
