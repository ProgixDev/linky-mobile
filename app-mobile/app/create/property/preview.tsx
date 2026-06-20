import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import {
  MapPin,
  BedDouble,
  Bath,
  Maximize2,
  Wifi,
  Car,
  Snowflake,
  Eye,
  Edit3,
  Check,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';
import { Building2 } from 'lucide-react-native';
import { formatGNF } from '../../../src/lib/format';
import { useCreateListing } from '../../../src/stores/createListing';
import { useCreateProperty } from '../../../src/data/queries/properties';
import { useToast } from '../../../src/components/feedback/Toast';
import { ApiError, toToastMessage } from '../../../src/lib/api';

// Phase I.9 — id → i18n key. The state stores STABLE ids ; the preview
// resolves the label via t() so the chip flips with the active language.
const AMENITY_LABEL_KEY: Record<string, string> = {
  wifi:    'create.amenityWifi',
  park:    'create.amenityParking',
  ac:      'create.amenityClim',
  bath:    'create.amenityBath',
  kitchen: 'create.amenityKitchen',
  furn:    'create.amenityFurn',
  tv:      'create.amenityTv',
  sec:     'create.amenitySec',
  garden:  'create.amenityGardenAlt',
  pool:    'create.amenityPool',
  lift:    'create.amenityLift',
  terrace: 'create.amenityTerrace',
};

export default function PreviewRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Phase U.0 nit — photo-less draft used to fall back to mockProperties[0]
  // Unsplash, suggesting the listing carried a real photo. Now: neutral
  // placeholder (bgSunken + Building2 icon).
  const state = useCreateListing();
  const reset = useCreateListing((s) => s.reset);
  const createProperty = useCreateProperty();
  const { show } = useToast();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        <ScreenHeader
          title={t('create.previewListingTitle')}
          subtitle={state.propertyType === 'location'
            ? t('create.previewSubRental')
            : t('create.previewSubSale')}
        />

        {/* Phone-style preview card */}
        <View style={{ paddingHorizontal: 24 }}>
          <View
            style={{
              borderRadius: 26,
              overflow: 'hidden',
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                height: 200,
                backgroundColor: colors.bgSunken,
                position: 'relative',
              }}
            >
              {state.propertyPhotos[0] ? (
                <Image
                  source={{ uri: state.propertyPhotos[0].url }}
                  style={{ flex: 1 }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.bgSunken,
                  }}
                >
                  <Building2 size={40} color={colors.textFaint} strokeWidth={1.5} />
                </View>
              )}
              <View
                style={{
                  position: 'absolute',
                  top: 14,
                  left: 14,
                  paddingHorizontal: 10,
                  height: 24,
                  borderRadius: 999,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: '700',
                    color: '#FFFFFF',
                    letterSpacing: 0.3,
                    lineHeight: 12,
                    includeFontPadding: false,
                  }}
                >
                  {state.propertyType === 'location' ? t('create.typeBadgeLocation') : state.propertyType === 'vente' ? t('create.typeBadgeVente') : t('create.typeBadgeTerrain')}
                </Text>
              </View>
            </View>
            <View style={{ padding: 16 }}>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: '700',
                  color: colors.text,
                  letterSpacing: -0.2,
                  lineHeight: 21,
                  includeFontPadding: false,
                }}
                numberOfLines={2}
              >
                {state.title}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  gap: 6,
                  marginTop: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '700',
                    color: colors.text,
                    fontVariant: ['tabular-nums'],
                    letterSpacing: -0.3,
                  }}
                >
                  {formatGNF(state.priceGnf).replace(' GNF', '')}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textMuted }}>
                  GNF{state.propertyType === 'location' ? t('create.perMonthAbbr') : ''}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 6,
                }}
              >
                <MapPin size={11} color={colors.textMuted} strokeWidth={2} />
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  {state.district ? `${state.district}, ${state.city}` : state.city}
                </Text>
              </View>

              {/* Spec strip */}
              <View
                style={{
                  flexDirection: 'row',
                  gap: 16,
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                {state.propertyType !== 'terrain' && <SpecMini Icon={BedDouble} label={t('create.specRoomsAbbr', { count: state.rooms })} />}
                <SpecMini Icon={Maximize2} label={t('create.specAreaAbbr', { count: state.areaSqm })} />
              </View>

              {/* Amenity chips — the user's actual selection, not hardcoded */}
              {state.amenities.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                  {state.amenities.map((aid) => (
                    <AmenityChip key={aid} Icon={Check} label={AMENITY_LABEL_KEY[aid] ? t(AMENITY_LABEL_KEY[aid]) : aid} />
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Edit shortcuts */}
        <View style={{ paddingHorizontal: 24, paddingTop: 22, gap: 10 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.textFaint,
              letterSpacing: 0.6,
              marginLeft: 4,
            }}
          >
            {t('create.previewEditHeader')}
          </Text>
          <EditRow Icon={Edit3} label={t('create.previewEditDetails')} route="/create/property/details" />
          <EditRow Icon={MapPin} label={t('create.previewEditLocation')} route="/create/property/location" />
          <EditRow Icon={Eye} label={t('create.previewEditPhotos')} route="/create/property/photos" />
        </View>
      </ScrollView>

      <SafeAreaView
        edges={['bottom']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 8,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          disabled={createProperty.isPending || !state.title.trim() || state.priceGnf <= 0 || state.propertyPhotos.length === 0 || !state.city.trim()}
          onPress={async () => {
            if (createProperty.isPending) return;
            try {
              haptic.medium();
              const property = await createProperty.mutateAsync({
                type: state.propertyType,
                title: state.title,
                price_minor: state.priceGnf,
                bedrooms: state.rooms || undefined,
                area_sqm: state.areaSqm || undefined,
                furnished: state.furnished,
                amenities: state.amenities,
                city: state.city,
                district: state.district || undefined,
                distance_to_road_m: state.distanceToRoadMeters,
                lat: state.lat,
                lng: state.lng,
                photos: state.propertyPhotos,
              });
              show(t('create.publishedSuccess'), 'success');
              reset();
              router.replace(`/property/${property.id}`);
            } catch (e: unknown) {
              console.error('[property-create] error:', e);
              // KYC_REQUIRED arrives when the soft-gate flips on (Didit creds
              // live + caller not yet approved). Route the user to /kyc/intro
              // instead of a dead-end toast.
              if (e instanceof ApiError && e.code === 'KYC_REQUIRED') {
                router.push('/kyc/intro');
              } else {
                show(toToastMessage(e, t('create.publishFailed')), 'danger');
              }
            }
          }}
          style={{
            height: 56,
            borderRadius: 16,
            backgroundColor: colors.text,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: createProperty.isPending ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: colors.bg,
              lineHeight: 18,
              includeFontPadding: false,
            }}
          >
            {createProperty.isPending ? t('create.publishListingBusy') : t('create.publishListingCta')}
          </Text>
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

function SpecMini({ Icon, label }: { Icon: typeof BedDouble; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Icon size={13} color={colors.textMuted} strokeWidth={2} />
      <Text style={{ fontSize: 12.5, color: colors.textMuted, letterSpacing: 0 }}>{label}</Text>
    </View>
  );
}

function AmenityChip({ Icon, label }: { Icon: typeof Wifi; label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        height: 22,
        borderRadius: 999,
        backgroundColor: colors.bgSunken,
      }}
    >
      <Icon size={11} color={colors.text} strokeWidth={2} />
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: '600',
          color: colors.text,
          lineHeight: 12,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function EditRow({ Icon, label, route }: { Icon: typeof Edit3; label: string; route: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => router.push(route as never)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
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
        }}
      >
        <Icon size={14} color={colors.text} strokeWidth={1.75} />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
          letterSpacing: 0,
          lineHeight: 17,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{t('create.previewEditCtaLabel')}</Text>
    </Pressable>
  );
}
