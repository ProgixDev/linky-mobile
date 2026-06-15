import { View } from 'react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Button } from '../primitives/Button';
import { I, type IconKey } from '../../icons/Icon';

export function EmptyState({
  icon = 'package',
  title,
  description,
  ctaLabel,
  onCta,
  tone = 'primary',
}: {
  icon?: IconKey;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  tone?: 'primary' | 'info' | 'danger';
}) {
  const { colors } = useTheme();
  const palette = {
    primary: { bg: colors.primarySoft, fg: colors.primary },
    info: { bg: 'rgba(58,124,168,0.1)', fg: colors.info },
    danger: { bg: 'rgba(209,79,60,0.1)', fg: colors.danger },
  }[tone];
  const Icon = I[icon] ?? I.package;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 0 }}>
      <View
        style={{
          width: 92,
          height: 92,
          borderRadius: 999,
          backgroundColor: palette.bg,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 22,
        }}
      >
        <Icon size={42} color={palette.fg} />
      </View>
      <Text variant="dispL" center style={{ fontSize: 20 }}>
        {title}
      </Text>
      {description && (
        <Text
          variant="bodyM"
          tone="muted"
          center
          style={{ marginTop: 8, maxWidth: 260, lineHeight: 20 }}
        >
          {description}
        </Text>
      )}
      {ctaLabel && onCta && (
        <View style={{ marginTop: 24 }}>
          <Button label={ctaLabel} onPress={onCta} />
        </View>
      )}
    </View>
  );
}

export function ErrorStateView({
  onRetry,
  onSupport,
}: {
  onRetry?: () => void;
  onSupport?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      tone="danger"
      icon="warn"
      title={t('states.errorTitle')}
      description={t('states.errorDescription')}
      ctaLabel={t('common.retry')}
      onCta={onRetry}
    />
  );
}

export function OfflineStateView({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      tone="info"
      icon="cloudOff"
      title={t('states.offlineTitle')}
      description={t('states.offlineDescription')}
      ctaLabel={t('common.retry')}
      onCta={onRetry}
    />
  );
}

export function OfflineBanner({ visible }: { visible: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: colors.info,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <I.cloudOff size={14} color="#FFFFFF" />
      <Text style={{ color: '#FFFFFF', fontSize: 12 }}>
        {t('states.offlineBanner')}
      </Text>
    </View>
  );
}

export function StateContainer({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}
