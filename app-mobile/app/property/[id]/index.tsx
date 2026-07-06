import { useEffect } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Chip } from '../../../src/components/primitives/Chip';
import { Card } from '../../../src/components/primitives/Card';
import { Button, IconButton } from '../../../src/components/primitives/Button';
import { MoneyText } from '../../../src/components/primitives/MoneyText';
import { TrustStrip } from '../../../src/components/primitives/TrustStrip';
import { MicroLabel } from '../../../src/components/lists/SectionHeader';
import { ListingComments } from '../../../src/components/comments/ListingComments';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { I, type IconKey } from '../../../src/icons/Icon';
import { useProperty, useTrackView, useFindOrCreateConversation } from '../../../src/data/queries';
import { useFavorites } from '../../../src/stores/favorites';
import { useAuth } from '../../../src/stores/auth';
import { DetailStateScreen } from '../../../src/components/feedback/DetailState';
import { useTranslation } from 'react-i18next';
import { PropertyLocationMap } from '../../../src/components/property/PropertyLocationMap';
import { formatDistance } from '../../../src/lib/format';
import { toToastMessage } from '../../../src/lib/api';
import { useToast } from '../../../src/components/feedback/Toast';
import { haptic } from '../../../src/lib/haptics';

export default function PropertyDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const { data: prop, isLoading, isError, refetch } = useProperty(id);
  const trackView = useTrackView();
  const findOrCreate = useFindOrCreateConversation();
  const { show } = useToast();
  const isFav = useFavorites((s) => (id ? s.propertyIds.has(id) : false));
  const toggleFav = useFavorites((s) => s.toggleProperty);
  // Self-action guard : the property's ownerId is the agent's user_id. When
  // the viewer owns this listing, the counterparty actions (Contacter +
  // Visiter) are replaced with a manage CTA — both backends 403 self-targets
  // (find-or-create-conversation, request-visit) so offering them is misleading.
  const authUserId = useAuth((s) => s.authUserId);
  const isOwnProperty = !!authUserId && !!prop?.ownerId && authUserId === prop.ownerId;

  // Fire-and-forget view bump on mount / when id changes. Failures don't block render.
  useEffect(() => {
    if (!id) return;
    trackView.mutate({ kind: 'property', id }, {
      onError: (e) => console.error('[view-track] property error:', e),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onChatPress() {
    if (!prop?.ownerId || !prop?.id) return;
    haptic.light();
    try {
      const r = await findOrCreate.mutateAsync({
        recipient_id: prop.ownerId,
        pinned_kind: 'property',
        pinned_id: prop.id,
      });
      router.push(`/messages/${r.conversation_id}`);
    } catch (e) {
      show(toToastMessage(e, "Impossible d'ouvrir la conversation"), 'danger');
    }
  }

  // Négocier le prix (rentals) — offers have no dedicated backend in V1, so we
  // open the owner conversation seeded with a negotiation opener the buyer can
  // edit before sending. Reuses the same pinned-listing chat as Contacter.
  async function onNegotiatePress() {
    if (!prop?.ownerId || !prop?.id) return;
    haptic.light();
    try {
      const r = await findOrCreate.mutateAsync({
        recipient_id: prop.ownerId,
        pinned_kind: 'property',
        pinned_id: prop.id,
      });
      const draft = `Bonjour, le prix de « ${prop.title} » est-il négociable ?`;
      router.push(`/messages/${r.conversation_id}?draft=${encodeURIComponent(draft)}`);
    } catch (e) {
      show(toToastMessage(e, "Impossible d'ouvrir la conversation"), 'danger');
    }
  }

  if (isLoading || isError || !prop) {
    return <DetailStateScreen loading={isLoading} title={t('property.fallbackTitle')} onRetry={() => void refetch()} />;
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
                <IconButton
                  variant="secondary"
                  size={36}
                  onPress={() => {
                    haptic.light();
                    void Share.share({
                      title: prop.title,
                      message: `${prop.title} — sur Linky`,
                    }).catch(() => {});
                  }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'transparent' }}
                >
                  <I.share size={16} color="#0E1311" />
                </IconButton>
                <IconButton
                  variant="secondary"
                  size={36}
                  onPress={() => {
                    haptic.light();
                    toggleFav(prop.id);
                  }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'transparent' }}
                >
                  <I.heart size={16} color={isFav ? colors.danger : '#0E1311'} fill={isFav ? colors.danger : 'transparent'} />
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
          <MoneyText
            amountGnf={prop.priceGnf}
            size="l"
            period={prop.type === 'location' ? (prop.perMonth ? 'month' : 'day') : undefined}
          />
          {prop.type === 'location' && (
            <Text variant="micro" tone="muted" style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}>
              {prop.perMonth ? 'par mois · charges incluses' : 'par jour'}
            </Text>
          )}

          {/* Négocier le prix — rentals only, and never on your own listing
              (find-or-create-conversation 403s self-targets). */}
          {prop.type === 'location' && !isOwnProperty && (
            <Button
              variant="outline"
              label="Négocier le prix"
              leading={<I.msg size={15} color={colors.text} />}
              onPress={onNegotiatePress}
              disabled={findOrCreate.isPending || !prop.ownerId}
              style={{ marginTop: 12, alignSelf: 'flex-start' }}
            />
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

          {/* Phase R.1 — Localisation for ALL property types : real Mapbox map
              from the listing's GPS (was a decorative SVG, and terrain — where
              location IS the product — had no map at all). Itinéraire hands
              off to the device maps app. */}
          <View style={{ marginTop: 14 }}>
            <MicroLabel label="Localisation" />
            <Card padding={12}>
              <PropertyLocationMap lat={prop.gps.lat} lng={prop.gps.lng} label={prop.title} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <I.pin size={16} color={colors.primary} />
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '600' }}>
                    {prop.district}, {prop.city}
                  </Text>
                  <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                    {isTerrain ? 'Terrain · parcelle' : 'Quartier résidentiel'}
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

          {!isTerrain && (
            <View style={{ marginTop: 14 }}>
              {prop.type === 'location' ? (
                <TrustStrip tone="primary">
                  <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
                    <Text style={{ fontWeight: '700' }}>Réservation sécurisée. </Text>
                    Ton paiement reste en séquestre jusqu'à ton emménagement. La visite est possible avant de réserver, mais optionnelle.
                  </Text>
                </TrustStrip>
              ) : (
                <TrustStrip tone="primary">
                  <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
                    <Text style={{ fontWeight: '700' }}>Visite obligatoire. </Text>
                    Pour un achat, la visite du bien est obligatoire avant toute transaction sur l'application.
                  </Text>
                </TrustStrip>
              )}
            </View>
          )}

          {/* Phase Y.4 — hide the section heading when no description, rather
              than showing the label above an empty paragraph. */}
          {prop.description.trim().length > 0 && (
            <View style={{ marginTop: 18 }}>
              <MicroLabel label={t('property.descriptionHeading')} />
              <Text variant="bodyM">{prop.description}</Text>
            </View>
          )}

          {/* Commentaires */}
          <View style={{ marginTop: 18 }}>
            <MicroLabel label="Commentaires" />
            <ListingComments kind="property" id={prop.id} />
          </View>
        </View>
      </ScrollView>

      {/* Phase U.0-B2 — offers have no V1 backend ; the «Faire une offre» /
          «Offre» CTAs were sending nothing and the target screen was 100 %
          mock. Removed until the offers backend lands. Buyers contact the
          agent via Message (Contacter) and book a visit instead.
          Self-action guard : when the viewer owns the property, replace
          counterparty actions with a manage CTA — both find-or-create and
          request-visit 403 self-targets, so offering them is misleading. */}
      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        {isOwnProperty ? (
          <Button
            variant="outline"
            style={{ flex: 1 }}
            label={t('property.manageListing')}
            leading={<I.edit size={16} color={colors.text} />}
            onPress={() => router.push(`/property/edit/${prop.id}`)}
          />
        ) : isTerrain ? (
          <Button
            variant="outline"
            style={{ flex: 1 }}
            label="Contacter"
            leading={<I.msg size={16} color={colors.text} />}
            onPress={onChatPress}
            disabled={findOrCreate.isPending || !prop.ownerId}
          />
        ) : prop.type === 'location' ? (
          // Booking flow (client 2026-07) : renting is the primary action ;
          // the visit stays available but OPTIONAL for rentals.
          <View style={{ flex: 1, gap: 8 }}>
            <Button
              size="lg"
              block
              label="Réserver ce logement"
              onPress={() => router.push(`/property/${prop.id}/book` as never)}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                variant="outline"
                style={{ flex: 1 }}
                label="Contacter"
                leading={<I.msg size={16} color={colors.text} />}
                onPress={onChatPress}
                disabled={findOrCreate.isPending || !prop.ownerId}
              />
              <Button
                variant="outline"
                style={{ flex: 1 }}
                label="Visiter (optionnel)"
                onPress={() => router.push(`/property/${prop.id}/visit`)}
              />
            </View>
          </View>
        ) : (
          // Achat/vente : la visite est OBLIGATOIRE avant toute transaction.
          <>
            <Button
              variant="outline"
              style={{ flex: 1 }}
              label="Contacter"
              leading={<I.msg size={16} color={colors.text} />}
              onPress={onChatPress}
              disabled={findOrCreate.isPending || !prop.ownerId}
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
