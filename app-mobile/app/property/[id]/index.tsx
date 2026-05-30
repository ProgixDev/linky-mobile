import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import Svg, { Path, Line } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Chip } from '../../../src/components/primitives/Chip';
import { Card } from '../../../src/components/primitives/Card';
import { Avatar } from '../../../src/components/primitives/Avatar';
import { Button, IconButton } from '../../../src/components/primitives/Button';
import { MoneyText } from '../../../src/components/primitives/MoneyText';
import { TrustStrip } from '../../../src/components/primitives/TrustStrip';
import { MicroLabel } from '../../../src/components/lists/SectionHeader';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { I, type IconKey } from '../../../src/icons/Icon';
import { useProperty, useTrackView } from '../../../src/data/queries';
import { formatDistance } from '../../../src/lib/format';

export default function PropertyDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, radii } = useTheme();
  const { data: prop, isLoading } = useProperty(id);
  const trackView = useTrackView();

  // Fire-and-forget view bump on mount / when id changes. Failures don't block render.
  useEffect(() => {
    if (!id) return;
    trackView.mutate({ kind: 'property', id }, {
      onError: (e) => console.error('[view-track] property error:', e),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading || !prop) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const isTerrain = prop.type === 'terrain';

  const metas: [IconKey, string, string][] = isTerrain
    ? [
        ['area', 'Surface', `${prop.areaSqm}m²`],
        ['check', 'Titre', 'Foncier'],
        ['road', 'Goudron', `${prop.distanceToRoadMeters}m`],
      ]
    : [
        ['area', 'Surface', `${prop.areaSqm}m²`],
        ['bed', 'Pièces', String(prop.bedrooms ?? 0)],
        ['sofa', 'Meublé', prop.furnished ? 'Oui' : 'Non'],
      ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ aspectRatio: 1, position: 'relative', backgroundColor: colors.bgSunken }}>
          <Image source={prop.photos[0]} style={{ flex: 1 }} contentFit="cover" />
          {/* Top action row — SafeAreaView adds padding for the status bar notch */}
          <SafeAreaView
            edges={['top']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12 }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 4,
              }}
            >
              <IconButton variant="secondary" size={36} onPress={() => router.back()} style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'transparent' }}>
                <I.arrowLeft size={18} color="#0E1311" />
              </IconButton>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <IconButton variant="secondary" size={36} style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'transparent' }}>
                  <I.share size={16} color="#0E1311" />
                </IconButton>
                <IconButton variant="secondary" size={36} style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'transparent' }}>
                  <I.heart size={16} color="#0E1311" />
                </IconButton>
              </View>
            </View>
          </SafeAreaView>
          {prop.videoUrl && (
            <View
              style={{
                position: 'absolute',
                bottom: 14,
                left: 14,
                flexDirection: 'row',
                gap: 5,
                alignItems: 'center',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: 'rgba(0,0,0,0.7)',
              }}
            >
              <I.video size={12} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>Visite vidéo</Text>
            </View>
          )}
        </View>

        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
            <Chip variant="soft" label={prop.type === 'location' ? 'Location' : prop.type === 'vente' ? 'Vente' : 'Terrain'} />
            {prop.furnished && <Chip variant="saffron" label="Meublé" />}
          </View>
          <Text variant="titleL" style={{ fontSize: 18, marginBottom: 2 }}>
            {prop.title}
          </Text>
          <MoneyText amountGnf={prop.priceGnf} size="l" perMonth={prop.perMonth} />
          {prop.perMonth && (
            <Text variant="micro" tone="muted" style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}>
              par mois · charges incluses
            </Text>
          )}

          {isTerrain && (
            <View style={{ marginTop: 14 }}>
              <TrustStrip tone="accent">
                <Text style={{ color: colors.accentText, fontSize: 12 }}>
                  Les transactions de terrains se font <Text style={{ fontWeight: '700' }}>hors application</Text>. Linky
                  ne traite ni le paiement, ni les documents notariés.
                </Text>
              </TrustStrip>
            </View>
          )}

          {/* Meta grid */}
          <View style={{ marginTop: 14, flexDirection: 'row', gap: 8 }}>
            {metas.map(([icon, k, v]) => {
              const Icon = I[icon];
              return (
                <View
                  key={k}
                  style={{
                    flex: 1,
                    backgroundColor: colors.bgElev,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    alignItems: 'center',
                  }}
                >
                  <Icon size={18} color={colors.primary} />
                  <Text variant="micro" tone="muted" style={{ marginTop: 6, letterSpacing: 0, textTransform: 'none' }}>
                    {k}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', marginTop: 1 }}>{v}</Text>
                </View>
              );
            })}
          </View>

          {!isTerrain && (
            <>
              <View style={{ marginTop: 14 }}>
                <MicroLabel label="Localisation" />
                <Card padding={12}>
                  <View
                    style={{
                      aspectRatio: 16 / 9,
                      borderRadius: 10,
                      overflow: 'hidden',
                      backgroundColor: '#C4D9C8',
                      marginBottom: 10,
                    }}
                  >
                    <Svg width="100%" height="100%" viewBox="0 0 280 160" preserveAspectRatio="none">
                      <Path d="M0 100 Q70 80 140 100 T280 110" fill="none" stroke="#0E6E55" strokeWidth="6" opacity={0.4} />
                      <Path d="M0 110 Q70 90 140 110 T280 120" fill="none" stroke="#0E6E55" strokeWidth="3" opacity={0.6} />
                      <Line x1="100" y1="0" x2="80" y2="160" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
                      <Line x1="200" y1="0" x2="220" y2="160" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
                    </Svg>
                    <View
                      style={{
                        position: 'absolute',
                        top: '40%',
                        left: '50%',
                        transform: [{ translateX: -15 }, { translateY: -30 }],
                      }}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          backgroundColor: colors.primary,
                          borderWidth: 3,
                          borderColor: '#FFFFFF',
                        }}
                      />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <I.pin size={16} color={colors.primary} />
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '600' }}>
                        {prop.district}, {prop.city}
                      </Text>
                      <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                        Quartier résidentiel
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      marginTop: 12,
                      padding: 10,
                      borderRadius: radii.md,
                      backgroundColor: colors.accentSoft,
                      flexDirection: 'row',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <I.road size={20} color={colors.accentText} />
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.accentText, fontVariant: ['tabular-nums'] }}>
                        {formatDistance(prop.distanceToRoadMeters)}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.accentText, opacity: 0.85 }}>
                        Accès facile en taxi ou moto
                      </Text>
                    </View>
                  </View>
                </Card>
              </View>

              <View style={{ marginTop: 16 }}>
                <MicroLabel label="Propriétaire" />
                <Card padding={12}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <Avatar source="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200" size="md" verified />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600' }}>Mamadou Bah · Agence</Text>
                      <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                        12 biens en gestion · répond en ~1h
                      </Text>
                    </View>
                  </View>
                </Card>
              </View>

              <View style={{ marginTop: 14 }}>
                <TrustStrip tone="primary">
                  <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
                    <Text style={{ fontWeight: '700' }}>Visite avant signature. </Text>
                    Tu ne paies aucun acompte tant que tu n'as pas visité le bien et confirmé.
                  </Text>
                </TrustStrip>
              </View>
            </>
          )}

          <View style={{ marginTop: 18 }}>
            <MicroLabel label="Description" />
            <Text variant="bodyM">{prop.description}</Text>
          </View>
        </View>
      </ScrollView>

      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        {isTerrain ? (
          <>
            <IconButton
              variant="secondary"
              size={44}
              onPress={() => router.push('/messages')}
            >
              <I.msg size={18} color={colors.text} />
            </IconButton>
            <Button
              style={{ flex: 1 }}
              label="Faire une offre"
              onPress={() => router.push(`/property/${prop.id}/offer`)}
            />
          </>
        ) : (
          <>
            <IconButton variant="secondary" size={44} onPress={() => router.push('/messages')}>
              <I.msg size={18} color={colors.text} />
            </IconButton>
            <Button
              variant="outline"
              style={{ flex: 1 }}
              label="Offre"
              onPress={() => router.push(`/property/${prop.id}/offer`)}
            />
            <Button
              style={{ flex: 1.4 }}
              label="Visiter"
              onPress={() => router.push(`/property/${prop.id}/visit`)}
            />
          </>
        )}
      </StickyBottom>
    </View>
  );
}
