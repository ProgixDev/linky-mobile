import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Navigation } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Badge } from '../primitives/Badge';
import { I } from '../../icons/Icon';
import { formatGNF, formatDistance } from '../../lib/format';
import { useDataSaverImageProps } from '../../lib/dataSaver';
import type { Property } from '../../data/types';

export function PropertyCard({
  property,
  distanceFromUserKm,
}: {
  property: Property;
  distanceFromUserKm?: number;
}) {
  const { colors, radii } = useTheme();
  const imgProps = useDataSaverImageProps();
  return (
    <Pressable
      onPress={() => router.push(`/property/${property.id}`)}
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 18,
        overflow: 'hidden',
      }}
      accessibilityRole="button"
      accessibilityLabel={`${property.title}, ${formatGNF(property.priceGnf)}${property.type === 'location' ? (property.perMonth ? ' par mois' : ' par jour') : ''}`}
    >
      <View style={{ aspectRatio: 16 / 9, backgroundColor: colors.bgSunken }}>
        <Image
          source={property.photos[0]}
          contentFit="cover"
          style={{ flex: 1 }}
          recyclingKey={property.id}
          transition={imgProps.transition}
          priority={imgProps.priority}
        />
        {/* Mock-era leftover removed: the badge was gated on
            ownerId === 'u_mamadou' (a seed id), so it never rendered with real
            data. Property has no verified field — reinstate when one exists. */}
        {property.badge && (
          <View style={{ position: 'absolute', top: 10, right: 10 }}>
            <Badge tone={property.badge === 'Réservé' ? 'reserved' : 'new'} label={property.badge} />
          </View>
        )}
        <View
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: radii.md,
            backgroundColor: 'rgba(0,0,0,0.78)',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] }}>
            {formatGNF(property.priceGnf)}
            {property.type === 'location' && (
              <Text style={{ fontSize: 10, fontWeight: '500', opacity: 0.85 }}>
                {property.perMonth ? ' /mois' : ' /jour'}
              </Text>
            )}
          </Text>
        </View>
        {property.favCount > 0 && (
          <View
            style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 8,
              height: 24,
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.55)',
            }}
          >
            <I.heartFill size={11} color="#FFFFFF" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] }}>
              {property.favCount}
            </Text>
          </View>
        )}
      </View>
      <View style={{ padding: 14, gap: 6 }}>
        <Text variant="titleM" numberOfLines={2}>
          {property.title}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
            <I.pin size={12} color={colors.textMuted} />
            <Text variant="caption" tone="muted">
              {property.district}
            </Text>
          </View>
          {property.bedrooms && (
            <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
              <I.bed size={12} color={colors.textMuted} />
              <Text variant="caption" tone="muted">
                {property.bedrooms}
              </Text>
            </View>
          )}
          {property.areaSqm && (
            <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
              <I.area size={12} color={colors.textMuted} />
              <Text variant="caption" tone="muted">
                {property.areaSqm}m²
              </Text>
            </View>
          )}
        </View>
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: colors.accentSoft,
            flexDirection: 'row',
            gap: 4,
            alignItems: 'center',
          }}
        >
          <I.road size={12} color={colors.accentText} />
          <Text style={{ color: colors.accentText, fontSize: 11, fontWeight: '600' }}>
            {formatDistance(property.distanceToRoadMeters)}
          </Text>
        </View>
        {distanceFromUserKm != null && distanceFromUserKm > 0 && (
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: colors.bgSunken,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              gap: 4,
              alignItems: 'center',
            }}
          >
            <Navigation size={11} color={colors.textMuted} strokeWidth={2} />
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>
              {distanceFromUserKm.toFixed(1)} km
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
