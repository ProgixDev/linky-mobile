// Phase K.6 — close-the-loop banner shown at the top of an order detail when
// the dispute has been resolved server-side. Buyer + seller see different
// copy and accent colors depending on the verdict.
//
// Amounts come from the order itself (no ledger fetch):
//   - Buyer refunded  → totalGnf (the full amount the buyer paid; both ledger
//                       transfers in resolve_dispute return amount+fees).
//   - Seller released → amountGnf, in full. The buyer pays the fee on top
//                       (total = amount + fees) and release credits the seller
//                       the whole amount_minor — the fee is never deducted
//                       from the seller (resolve_dispute release branch).
//
// Date: walk order.events for kind === 'dispute_resolved' and read `at`.
// Falls back to the most recent event if no resolved entry exists (legacy
// rows or events that pre-date Phase K stamping).
//
// PII: get-order calls mapOrder without includeAdminMeta, so the mapper
// already strips admin_id from dispute_resolved events on the wire. The
// banner never reads admin_id and would not have it if it tried.
//
// The component returns null for any status outside {refunded, released},
// so consumers can render <OrderResolutionBanner ... /> unconditionally.

import { View } from 'react-native';
import { ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import type { Colors } from '../../theme/tokens';
import { Text } from '../primitives/Text';
import { formatGNF } from '../../lib/format';
import type { Order } from '../../data/types';

type Variant = 'success' | 'neutral' | 'warning';
type IconComponent = typeof ShieldCheck;

interface Content {
  variant: Variant;
  icon: IconComponent;
  title: string;
  body: string;
}

export interface OrderResolutionBannerProps {
  order: Order;
  viewerRole: 'buyer' | 'seller';
}

export function OrderResolutionBanner({ order, viewerRole }: OrderResolutionBannerProps) {
  const { colors } = useTheme();
  if (order.status !== 'refunded' && order.status !== 'released') return null;

  const resolvedAt = findDisputeResolvedAt(order.events) ?? order.events[order.events.length - 1]?.at;
  const dateLabel = resolvedAt ? formatResolutionDate(resolvedAt) : null;
  const content = buildContent({ order, viewerRole, dateLabel });
  if (!content) return null;

  const styles = variantStyles(colors, content.variant);
  const Icon = content.icon;

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${content.title}. ${content.body}`}
      style={{
        marginBottom: 14,
        padding: 14,
        borderRadius: 14,
        backgroundColor: styles.bg,
        borderWidth: 1,
        borderColor: styles.border,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <Icon
        size={16}
        color={styles.iconColor}
        strokeWidth={2.25}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 13.5,
            fontWeight: '600',
            color: styles.titleColor,
            lineHeight: 18,
            includeFontPadding: false,
          }}
        >
          {content.title}
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontSize: 12.5,
            color: styles.bodyColor,
            lineHeight: 18,
            letterSpacing: 0,
          }}
        >
          {content.body}
        </Text>
      </View>
    </View>
  );
}

function buildContent({
  order,
  viewerRole,
  dateLabel,
}: {
  order: Order;
  viewerRole: 'buyer' | 'seller';
  dateLabel: string | null;
}): Content | null {
  const dateSuffix = dateLabel ? ` le ${dateLabel}` : '';

  if (viewerRole === 'buyer') {
    if (order.status === 'refunded') {
      return {
        variant: 'success',
        icon: ShieldCheck,
        title: 'Litige résolu',
        body: `${formatGNF(order.totalGnf)} remboursés sur votre wallet${dateSuffix}.`,
      };
    }
    if (order.status === 'released') {
      return {
        variant: 'neutral',
        icon: CheckCircle2,
        title: 'Litige clos',
        body: `Commande libérée au vendeur${dateSuffix}.`,
      };
    }
  }

  if (viewerRole === 'seller') {
    if (order.status === 'released') {
      return {
        variant: 'success',
        icon: ShieldCheck,
        title: 'Litige résolu en votre faveur',
        body: `${formatGNF(order.amountGnf)} libérés sur votre wallet${dateSuffix}.`,
      };
    }
    if (order.status === 'refunded') {
      return {
        variant: 'warning',
        icon: AlertCircle,
        title: "Litige tranché en faveur de l'acheteur",
        body: 'Aucun versement pour cette commande.',
      };
    }
  }

  return null;
}

// The mobile Order.events type is closed ({ at, label }) but Phase K events
// carry { kind, outcome, reason, note } too — narrow per-field via typeof.
function findDisputeResolvedAt(events: Order['events']): string | undefined {
  for (const e of events) {
    if ((e as { kind?: unknown }).kind === 'dispute_resolved') return e.at;
  }
  return undefined;
}

function formatResolutionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

interface VariantStyles {
  bg: string;
  border: string;
  iconColor: string;
  titleColor: string;
  bodyColor: string;
}

function variantStyles(colors: Colors, v: Variant): VariantStyles {
  switch (v) {
    case 'success':
      return {
        bg: colors.primarySoft,
        border: colors.primarySoft,
        iconColor: colors.success,
        titleColor: colors.primaryDeep,
        bodyColor: colors.text,
      };
    case 'neutral':
      return {
        bg: colors.bgSunken,
        border: colors.border,
        iconColor: colors.textMuted,
        titleColor: colors.text,
        bodyColor: colors.textMuted,
      };
    case 'warning':
      return {
        bg: colors.accentSoft,
        // Accent at ~25% opacity for a visible warm rim without shouting.
        border: colors.accent + '40',
        iconColor: colors.accentText,
        titleColor: colors.accentText,
        bodyColor: colors.text,
      };
  }
}
