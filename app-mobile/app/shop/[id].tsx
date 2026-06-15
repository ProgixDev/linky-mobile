import { useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Share2,
  MapPin,
  Clock,
  ShieldCheck,
  Star,
  MessageCircle,
} from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { ProductCard } from '../../src/components/lists/ProductCard';
import { useShop, useProducts, useFindOrCreateConversation } from '../../src/data/queries';
import { haptic } from '../../src/lib/haptics';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { DetailStateScreen } from '../../src/components/feedback/DetailState';

type Tab = 'articles' | 'reviews' | 'about';

const HERO_HEIGHT = 220;

export default function ShopRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data: shop, isLoading, isError, refetch } = useShop(id);
  const { data: products } = useProducts({ shopId: id });
  const [tab, setTab] = useState<Tab>('articles');
  const [following, setFollowing] = useState(false);
  // Phase X.2 — shop "Message" wires the same find-or-create-conversation
  // pattern as product/property detail. No pinned listing : the contact is
  // shop-level, not about a specific item.
  const findOrCreate = useFindOrCreateConversation();
  const toast = useToast();
  const onMessagePress = async () => {
    if (!shop?.ownerId || findOrCreate.isPending) return;
    try {
      haptic.light();
      const r = await findOrCreate.mutateAsync({ recipient_id: shop.ownerId });
      router.push(`/messages/${r.conversation_id}`);
    } catch (e) {
      toast.show(toToastMessage(e, "Impossible d'ouvrir la conversation."), 'danger');
    }
  };

  if (isLoading || isError || !shop) {
    return <DetailStateScreen loading={isLoading} title="Boutique" onRetry={() => void refetch()} />;
  }

  // Phase Y.1 — never render a bare/placeholder response time. The DB used to
  // ship a mojibake em-dash placeholder ; we now blank that and only show the
  // segment when a real value is present.
  const hasResponseTime = shop.responseTime.trim().length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ===== Cover hero ===== */}
        <View style={{ height: HERO_HEIGHT, backgroundColor: colors.bgSunken, position: 'relative' }}>
          <Image source={shop.cover} style={{ flex: 1 }} contentFit="cover" />
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
            locations={[0, 0.45, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* Top action row */}
          <View
            style={{
              position: 'absolute',
              top: 54,
              left: 16,
              right: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <CircleButton onPress={() => router.back()} accessibilityLabel="Retour">
              <ArrowLeft size={18} color={colors.text} strokeWidth={2} />
            </CircleButton>
            {/* Phase X.7 — Share wired to native Share API (message-only ;
                a linky:// URL would dead-end for recipients without the
                app) ; "Plus" kebab removed (no V1 per-shop menu). */}
            <CircleButton
              onPress={() => {
                void Share.share({
                  title: shop.name,
                  message: `${shop.name} sur Linky`,
                }).catch(() => {});
              }}
              accessibilityLabel="Partager"
            >
              <Share2 size={16} color={colors.text} strokeWidth={2} />
            </CircleButton>
          </View>
        </View>

        {/* ===== Card overlapping the cover ===== */}
        <View style={{ paddingHorizontal: 20, marginTop: -48 }}>
          <View
            style={{
              backgroundColor: colors.bg,
              borderRadius: 24,
              padding: 18,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              <View style={{ position: 'relative' }}>
                <Image
                  source={shop.avatar}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    backgroundColor: colors.bgSunken,
                  }}
                  contentFit="cover"
                />
                {shop.verified && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: colors.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 3,
                      borderColor: colors.bg,
                    }}
                  >
                    <ShieldCheck size={11} color="#FFFFFF" strokeWidth={3} />
                  </View>
                )}
              </View>

              <View style={{ flex: 1, paddingTop: 4 }}>
                <Text
                  style={{
                    fontSize: 19,
                    fontWeight: '700',
                    color: colors.text,
                    letterSpacing: -0.2,
                  }}
                  numberOfLines={1}
                >
                  {shop.name}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 4,
                  }}
                >
                  <MapPin size={11} color={colors.textMuted} strokeWidth={2} />
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.textMuted,
                      letterSpacing: 0,
                    }}
                    numberOfLines={1}
                  >
                    {shop.city}
                  </Text>
                  {hasResponseTime && (
                    <>
                      <Text style={{ fontSize: 12, color: colors.textFaint }}>·</Text>
                      <Clock size={11} color={colors.textMuted} strokeWidth={2} />
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.textMuted,
                          letterSpacing: 0,
                        }}
                      >
                        {shop.responseTime}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>

            {/* Stats row */}
            <View
              style={{
                flexDirection: 'row',
                marginTop: 16,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <StatColumn
                value={
                  shop.followerCount >= 1000
                    ? `${(shop.followerCount / 1000).toFixed(1)}k`
                    : String(shop.followerCount)
                }
                label="Abonnés"
              />
              <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
              <StatColumn value={String(shop.productCount)} label="Articles" />
              <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
              <StatColumn
                value={shop.rating.toFixed(1)}
                label={`${shop.reviewCount} avis`}
                trailing={<Star size={11} color={colors.accent} fill={colors.accent} />}
              />
            </View>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Button
                variant={following ? 'outline' : 'dark'}
                size="md"
                label={following ? 'Abonné' : 'Suivre'}
                style={{ flex: 2 }}
                onPress={() => {
                  haptic.light();
                  setFollowing((f) => !f);
                }}
              />
              <Pressable
                onPress={onMessagePress}
                disabled={findOrCreate.isPending || !shop?.ownerId}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 999,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  opacity: findOrCreate.isPending || !shop?.ownerId ? 0.5 : 1,
                }}
                accessibilityLabel="Contacter le vendeur"
              >
                <MessageCircle size={15} color={colors.text} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                  Message
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ===== Tab pills ===== */}
        <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
          <View
            style={{
              flexDirection: 'row',
              gap: 6,
              padding: 4,
              borderRadius: 999,
              backgroundColor: colors.bgSunken,
            }}
          >
            {(['articles', 'reviews', 'about'] as const).map((t) => {
              const active = tab === t;
              const label = t === 'articles' ? 'Articles' : t === 'reviews' ? 'Avis' : 'À propos';
              return (
                <Pressable
                  key={t}
                  onPress={() => {
                    haptic.selection();
                    setTab(t);
                  }}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 999,
                    backgroundColor: active ? colors.bg : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13.5,
                      fontWeight: '600',
                      color: active ? colors.text : colors.textMuted,
                      letterSpacing: 0,
                      lineHeight: 16,
                      includeFontPadding: false,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ===== Tab content ===== */}
        {tab === 'articles' && (
          <View
            style={{
              padding: 20,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 14,
            }}
          >
            {products?.map((p) => (
              <View key={p.id} style={{ flexBasis: '47%', flexGrow: 1 }}>
                <ProductCard product={p} compact />
              </View>
            ))}
          </View>
        )}

        {tab === 'reviews' && (
          <View style={{ padding: 20 }}>
            <View
              style={{
                padding: 20,
                borderRadius: 20,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 36,
                    fontWeight: '700',
                    color: colors.text,
                    lineHeight: 40,
                    fontVariant: ['tabular-nums'],
                    letterSpacing: -1,
                  }}
                >
                  {shop.rating.toFixed(1)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 1, marginTop: 4 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star
                      key={i}
                      size={13}
                      color={i < Math.round(shop.rating) ? colors.accent : colors.border}
                      fill={i < Math.round(shop.rating) ? colors.accent : 'transparent'}
                    />
                  ))}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.textMuted,
                    lineHeight: 18,
                    letterSpacing: 0,
                  }}
                >
                  Note basée sur les {shop.reviewCount} avis vérifiés de clients ayant acheté
                  chez {shop.name}.
                </Text>
              </View>
            </View>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                marginTop: 20,
                textAlign: 'center',
                letterSpacing: 0,
              }}
            >
              Les avis détaillés arrivent bientôt.
            </Text>
          </View>
        )}

        {tab === 'about' && (
          <View style={{ padding: 20 }}>
            <View
              style={{
                padding: 18,
                borderRadius: 20,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.textFaint,
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                À PROPOS
              </Text>
              <Text
                style={{
                  fontSize: 14.5,
                  color: colors.text,
                  lineHeight: 22,
                  letterSpacing: 0,
                }}
              >
                {shop.about}
              </Text>
            </View>

            <View style={{ marginTop: 14, gap: 10 }}>
              <InfoRow Icon={MapPin} label="Ville" value={shop.city} />
              {hasResponseTime && (
                <InfoRow Icon={Clock} label="Temps de réponse" value={shop.responseTime} />
              )}
              {shop.verified && (
                <InfoRow
                  Icon={ShieldCheck}
                  label="Vérifié"
                  value="Vendeur identifié par Linky"
                  accent
                />
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------- Subcomponents ----------

function CircleButton({
  onPress,
  children,
  accessibilityLabel,
}: {
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.95)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </Pressable>
  );
}

function StatColumn({
  value,
  label,
  trailing,
}: {
  value: string;
  label: string;
  trailing?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text
          style={{
            fontSize: 17,
            fontWeight: '700',
            color: colors.text,
            fontVariant: ['tabular-nums'],
            letterSpacing: 0,
          }}
        >
          {value}
        </Text>
        {trailing}
      </View>
      <Text
        style={{
          fontSize: 11.5,
          color: colors.textMuted,
          letterSpacing: 0,
          marginTop: 2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function InfoRow({
  Icon,
  label,
  value,
  accent,
}: {
  Icon: typeof MapPin;
  label: string;
  value: string;
  accent?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 14,
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
          backgroundColor: accent ? colors.accentSoft : colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          size={14}
          color={accent ? colors.accentText : colors.text}
          strokeWidth={2}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: colors.textFaint,
            letterSpacing: 0.5,
          }}
        >
          {label.toUpperCase()}
        </Text>
        <Text
          style={{
            fontSize: 13.5,
            fontWeight: '600',
            color: colors.text,
            marginTop: 1,
            letterSpacing: 0,
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}
