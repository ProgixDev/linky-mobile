import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { ScreenHeader } from '../nav/ScreenHeader';

export interface LegalSection {
  heading: string;
  body: string;
}

export function LegalDoc({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <ScreenHeader title={title} subtitle={t('legal.lastUpdated', { date: updated })} />

        <View style={{ paddingHorizontal: 24, gap: 22 }}>
          {sections.map((s, i) => (
            <View key={s.heading}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.primary,
                    fontVariant: ['tabular-nums'],
                    letterSpacing: 0.4,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: colors.text,
                    letterSpacing: -0.2,
                    lineHeight: 22,
                    flex: 1,
                  }}
                >
                  {s.heading}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.textMuted,
                  lineHeight: 22,
                  letterSpacing: 0,
                }}
              >
                {s.body}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
