import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
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
import { useShop } from '../../../src/data/queries/shops';
import { useFavorites } from '../../../src/stores/favorites';
import { useAuth } from '../../../src/stores/auth';
import { DetailStateScreen } from '../../../src/components/feedback/DetailState';
import { useTranslation } from 'react-i18next';
import { PropertyLocationMap } from '../../../src/components/property/PropertyLocationMap';
import { formatDistance } from '../../../src/lib/format';
import { toToastMessage } from '../../../src/lib/api';
import { useToast } from '../../../src/components/feedback/Toast';
import { haptic } from '../../../src/lib/haptics';
import { shareMessage } from '../../../src/lib/share';

export default function PropertyDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, radii } = useTheme();
  // LIVE carousel width (capped to the 500 content column). A static module
  // Dimensions.get() didn't follow Android screen zoom → the item was narrower
  // than the screen and the next photo peeked in (client 2026-07-30).
  const { width: winW } = useWindowDimensions();
  const SW = Math.min(winW, 500);
  const { t } = useTranslation();
  const { data: prop, isLoading, isError, refetch } = useProperty(id);
  const trackView = useTrackView();
  const findOrCreate = useFindOrCreateConversation();
  const { show } = useToast();
  const isFav = useFavorites((s) => (id ? s.propertyIds.has(id) : false));
  const toggleFav = useFavorites((s) => s.toggleProperty);
  const [photoIdx, setPhotoIdx] = useState(0);
  // Hauteur mesuree du pied collant. 160 = repli le temps du premier rendu :
  // la valeur du pied a deux rangees, pour qu'aucune frame ne masque le bas.
  const [footerH, setFooterH] = useState(160);
  // Detail page is IMAGES ONLY (client 2026-07-27) — a listing's video shows
  // only in the Découvrir feed, never on the detail page.
  const videoSrc = '';
  const player = useVideoPlayer(videoSrc, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (!videoSrc) return;
    if (photoIdx === 0) player.play();
    else player.pause();
  }, [photoIdx, player, videoSrc]);
  // Self-action guard : the property's ownerId is the agent's user_id. When
  // the viewer owns this listing, the counterparty actions (Contacter +
  // Visiter) are replaced with a manage CTA — both backends 403 self-targets
  // (find-or-create-conversation, request-visit) so offering them is misleading.
  const authUserId = useAuth((s) => s.authUserId);
  const isOwnProperty = !!authUserId && !!prop?.ownerId && authUserId === prop.ownerId;
  // Agency (= the shop the property belongs to) — shown as a card linking to the
  // agency page, like the boutique card on a product (client 2026-08-03).
  const { data: agency } = useShop(prop?.shopId);

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
        // Was a hardcoded « Titre : Foncier » — a fabricated land-title claim
        // shown on EVERY terrain. Replaced with real data (the city).
        ['pin', 'Ville', prop.city],
        ['road', 'Goudron', `${prop.distanceToRoadMeters}m`],
      ]
    : [
        ['area', 'Surface', `${prop.areaSqm}m²`],
        ['bed', 'Pièces', String(prop.bedrooms ?? 0)],
        ['sofa', 'Meublé', prop.furnished ? 'Oui' : 'Non'],
      ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* La marge basse suit la hauteur REELLE du pied collant (client
          2026-08-11 : « Voir les commentaires » passait dessous). Elle etait
          figee a 100 px, valeur juste tant que le pied n'avait qu'une rangee ;
          la reservation en a ajoute une seconde. Mesurer plutot que deviner
          evite que le prochain bouton ajoute recasse la meme chose. */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: footerH + 24 }}>
        <View style={{ aspectRatio: 1, position: 'relative', backgroundColor: colors.bgSunken }}>
          {/* Swipeable photo carousel (client 2026-07-22) — was a single static
              image ; multi-photo property listings now page + animate like the
              product page. */}
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
              if (idx !== photoIdx) setPhotoIdx(idx);
            }}
            scrollEventThrottle={16}
          >
            {videoSrc ? (
              <VideoView
                player={player}
                style={{ width: SW, height: SW, backgroundColor: '#000000' }}
                contentFit="cover"
                nativeControls={false}
              />
            ) : null}
            {prop.photos.map((photo, i) => (
              <Image
                key={i}
                source={photo}
                style={{ width: SW, height: SW, backgroundColor: colors.bgSunken }}
                contentFit="cover"
              />
            ))}
          </ScrollView>
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
                      message: shareMessage(`${prop.title} — sur Linky`, 'property', prop.id),
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
            <Pressable
              onPress={() =>
                // Ouvre le fil Decouvrir directement sur CETTE annonce, ou la
                // video se lit en plein ecran (client 2026-08-11).
                router.push(`/(tabs)/decouvrir?focusKind=property&focusId=${prop.id}` as never)
              }
              accessibilityRole="button"
              accessibilityLabel="Voir la visite vidéo"
              hitSlop={8}
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
            </Pressable>
          )}

          {/* Carousel dots — counts the video slide (if any) + photos. */}
          {(videoSrc ? 1 : 0) + prop.photos.length > 1 && (
            <View
              style={{
                position: 'absolute',
                bottom: 14,
                left: 0,
                right: 0,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              {Array.from({ length: (videoSrc ? 1 : 0) + prop.photos.length }).map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === photoIdx ? 22 : 6,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: i === photoIdx ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
                  }}
                />
              ))}
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
              {/* « charges incluses » removed — no data field asserts it. */}
              {prop.perMonth ? 'par mois' : 'par jour'}
            </Text>
          )}

          {/* Négocier le prix — rentals only, and never on your own listing
              (find-or-create-conversation 403s self-targets). */}
          {prop.type === 'location' && !isOwnProperty && (
            <Button
              variant="outline"
              // `block` plutot qu'un alignSelf : la zone cliquable du bouton
              // porte width:'100%'. Sur un conteneur dimensionne au contenu,
              // ce pourcentage se resout sur l'espace DISPONIBLE et la pastille
              // deborde a droite — son texte, pourtant centre a l'interieur,
              // apparait alors decale (client 2026-08-11).
              block
              label="Négocier le prix"
              leading={<I.msg size={15} color={colors.text} />}
              onPress={onNegotiatePress}
              disabled={findOrCreate.isPending || !prop.ownerId}
              style={{ marginTop: 12 }}
            />
          )}

          {/* Description — moved up (client 2026-07-22) so buyers read what the
              place is before the details / map, instead of at the very bottom. */}
          {prop.description.trim().length > 0 && (
            <View style={{ marginTop: 18 }}>
              <MicroLabel label={t('property.descriptionHeading')} />
              <Text variant="bodyM">{prop.description}</Text>
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
                  Pour acheter via l'application, la visite du bien doit être effectuée et confirmée par le propriétaire au préalable. Ton paiement reste ensuite en séquestre jusqu'à la remise du bien.
                </Text>
              </TrustStrip>
            )}
          </View>

          {/* ===== Agence card — links to the agency page (client 2026-08-03) ===== */}
          {agency && (
            <View style={{ marginTop: 18 }}>
              <MicroLabel label={t('property.agencyHeading')} />
              <Pressable
                onPress={() => router.push(`/shop/${agency.id}`)}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <Image
                  source={agency.avatar}
                  style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: colors.bgSunken }}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>
                    {agency.name}
                  </Text>
                  <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                    {t('property.agencyView')}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
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
      <StickyBottom
        style={{ flexDirection: 'row', gap: 8 }}
        onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
      >
        {isOwnProperty ? (
          <Button
            variant="outline"
            style={{ flex: 1 }}
            label={t('property.manageListing')}
            leading={<I.edit size={16} color={colors.text} />}
            onPress={() => router.push(`/property/edit/${prop.id}`)}
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
          // Achat/vente ET terrain (client 2026-08-31 : payer via l'appli OU
          // voir avec le propriétaire directement — les deux restent
          // disponibles). La visite reste OBLIGATOIRE avant tout achat
          // en ligne ; le serveur refuse sinon (VISIT_REQUIRED), avec un
          // message clair plutôt qu'un blocage silencieux côté UI.
          <View style={{ flex: 1, gap: 8 }}>
            <Button
              size="lg"
              block
              label="Acheter via l'application"
              onPress={() => router.push(`/property/${prop.id}/buy` as never)}
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
                label="Visiter"
                onPress={() => router.push(`/property/${prop.id}/visit`)}
              />
            </View>
          </View>
        )}
      </StickyBottom>
    </View>
  );
}
