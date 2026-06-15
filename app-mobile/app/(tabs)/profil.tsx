import { ScrollView, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import {
  ChevronRight,
  MapPin,
  Phone,
  Bell,
  Globe2,
  Sparkles as SparklesIcon,
  CloudOff,
  Eye,
  Info,
  MessageCircle,
  FileText,
  ShieldCheck,
  Shield,
  LogOut,
  Package,
  CalendarDays,
  Heart,
  Wallet,
  Pencil,
  Store,
  Building2,
  CalendarCheck,
  Banknote,
  UserCog,
  Home as HomeIcon,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Switch } from '../../src/components/primitives/Switch';
import { haptic } from '../../src/lib/haptics';
import { registerPushToken, unregisterPushToken } from '../../src/lib/push';
import { useAuth, type UserRole } from '../../src/stores/auth';
import { usePrefs } from '../../src/stores/prefs';
import { useKycStatus } from '../../src/data/queries';

interface QuickAction {
  Icon: LucideIcon;
  label: string;
  badge?: string;
  href?: string;
}

// Phase T.2 — quick actions filtered per role. Multi-role users get the
// union, ordered: buyer-side first (most common), then seller, then agent.
// Pure buyers no longer see zero pro shortcuts (KYC stays universal since
// it gates publishing AND high-value buyer flows).
// Phase I.3c — takes t so labels translate.
function buildQuickActions(roles: UserRole[], t: (k: string) => string): QuickAction[] {
  const isBuyer = roles.includes('buyer');
  const isSeller = roles.includes('seller');
  const isAgent = roles.includes('agent');
  const out: QuickAction[] = [];
  if (isBuyer) {
    out.push({ Icon: Package, label: t('profil.qa.commandes'), href: '/orders' });
    out.push({ Icon: CalendarDays, label: t('profil.qa.demandes'), href: '/buyer/requests' });
    out.push({ Icon: Heart, label: t('profil.qa.favoris'), href: '/favorites' });
  }
  if (isSeller) {
    out.push({ Icon: Store, label: t('profil.qa.ventes'), href: '/seller/orders' });
    out.push({ Icon: Banknote, label: t('profil.qa.retraits'), href: '/wallet/retirer' });
  }
  if (isAgent) {
    out.push({ Icon: CalendarCheck, label: t('profil.qa.visites'), href: '/pro/visites' });
  }
  out.push({ Icon: Wallet, label: t('profil.qa.wallet'), href: '/wallet' });
  out.push({ Icon: ShieldCheck, label: t('profil.qa.kyc'), href: '/kyc/intro' });
  return out;
}

// Language NATIVE names are universal across UI languages.
const LANGUAGE_LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  pular: 'Pular',
  sousou: 'Sousou',
};

export default function ProfilRoute() {
  const { colors, preference } = useTheme();
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const roles = useAuth((s) => s.roles);
  const signOut = useAuth((s) => s.signOut);
  const { dataSaver, setDataSaver, notifications, setNotifications, language } = usePrefs();

  // Notifications toggle must also (un)register the device's push token,
  // not just flip the MMKV flag — otherwise the OS-level subscription drifts
  // out of sync with the user's stated preference.
  const onToggleNotifications = (v: boolean) => {
    setNotifications(v);
    if (v) void registerPushToken();
    else void unregisterPushToken();
  };
  // Live status beats the MMKV-cached user snapshot (which only refreshes at
  // sign-in) — a KYC approval should light the chip on the next profile visit.
  const { data: kyc } = useKycStatus();
  const kycApproved = (kyc?.kycStatus ?? user?.kyc_status) === 'approved';
  const quickActions = buildQuickActions(roles, t);
  const THEME_LABELS: Record<string, string> = {
    system: t('profil.theme.system'),
    light: t('profil.theme.light'),
    dark: t('profil.theme.dark'),
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ===== Title ===== */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 18 }}>
          <Text
            style={{
              fontSize: 32,
              fontWeight: '700',
              color: colors.text,
              letterSpacing: -0.5,
              lineHeight: 38,
            }}
          >
            {t('profil.title')}
          </Text>
        </View>

        {/* ===== Profile card ===== */}
        <View style={{ paddingHorizontal: 24 }}>
          <View
            style={{
              padding: 16,
              borderRadius: 22,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <View style={{ position: 'relative' }}>
              <Image
                source={user?.avatar_url ?? undefined}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 999,
                  backgroundColor: colors.bgSunken,
                }}
                contentFit="cover"
              />
              {kycApproved && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 3,
                    borderColor: colors.card,
                  }}
                >
                  <ShieldCheck size={11} color="#FFFFFF" strokeWidth={3} />
                </View>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: colors.text,
                  letterSpacing: -0.2,
                  lineHeight: 22,
                  includeFontPadding: false,
                }}
                numberOfLines={1}
              >
                {user?.display_name ?? t('profil.fallbackName')}
              </Text>
              {user?.city ? (
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
                    {user.city}
                  </Text>
                </View>
              ) : null}
              <Pressable
                hitSlop={6}
                onPress={() => {
                  haptic.light();
                  router.push('/profil/edit' as never);
                }}
                style={{
                  marginTop: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  alignSelf: 'flex-start',
                }}
              >
                <Pencil size={11} color={colors.primary} strokeWidth={2.25} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.primary,
                    letterSpacing: 0,
                  }}
                >
                  {t('profil.editMyProfile')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ===== Boutique hero (Phase X.10 revised) ===== */}
        {/* Pros land on their workspace in one tap. Sellers see "Ma boutique" ;
            agents see "Mes biens" ; users who are BOTH see both stacked. Pure
            buyers see neither (no card rendered). Replaces the X.10-original
            Home-header Boutique shortcut. */}
        {(roles.includes('seller') || roles.includes('agent')) && (
          <View style={{ paddingHorizontal: 24, paddingTop: 18, gap: 10 }}>
            {roles.includes('seller') && (
              <BoutiqueHero
                Icon={Store}
                title={t('profil.boutiqueHero.shopTitle')}
                sub={t('profil.boutiqueHero.shopSub')}
                ctaLabel={t('profil.boutiqueHero.shopCta')}
              />
            )}
            {roles.includes('agent') && (
              <BoutiqueHero
                Icon={Building2}
                title={t('profil.boutiqueHero.agentTitle')}
                sub={t('profil.boutiqueHero.agentSub')}
                ctaLabel={t('profil.boutiqueHero.agentCta')}
              />
            )}
          </View>
        )}

        {/* ===== Quick actions ===== */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 16,
            gap: 8,
          }}
        >
          {quickActions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                haptic.light();
                if (a.href) router.push(a.href as never);
              }}
              style={{
                height: 40,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <a.Icon size={15} color={colors.text} strokeWidth={1.75} />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors.text,
                  letterSpacing: 0,
                  lineHeight: 16,
                  includeFontPadding: false,
                }}
              >
                {a.label}
              </Text>
              {a.badge && (
                <View
                  style={{
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 5,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 10,
                      fontWeight: '700',
                      lineHeight: 12,
                      includeFontPadding: false,
                    }}
                  >
                    {a.badge}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* ===== Réglages section ===== */}
        <View style={{ paddingHorizontal: 24, paddingTop: 28 }}>
          <SectionLabel label={t('profil.section.reglages')} />
          <SettingsCard>
            <Row
              Icon={Phone}
              label={t('profil.row.phones')}
              onPress={() => router.push('/settings/phones')}
            />
            <Row
              Icon={MapPin}
              label={t('profil.row.addresses')}
              onPress={() => router.push('/settings/addresses')}
            />
            <Row
              Icon={UserCog}
              label={t('profil.row.roles')}
              value={t('profil.row.roleCount', { count: roles.length })}
              onPress={() => router.push('/profil/roles' as never)}
            />
            <Row
              Icon={ShieldCheck}
              label={t('profil.row.kyc')}
              onPress={() => router.push('/kyc/intro')}
              right={
                kycApproved ? (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: colors.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: '700',
                        color: colors.primaryDeep,
                        letterSpacing: 0.3,
                        lineHeight: 12,
                        includeFontPadding: false,
                      }}
                    >
                      {t('profil.row.kycVerified')}
                    </Text>
                  </View>
                ) : undefined
              }
            />
            <Row
              Icon={Bell}
              label={t('profil.row.notifications')}
              right={<Switch value={notifications} onChange={onToggleNotifications} />}
            />
            <Row
              Icon={Globe2}
              label={t('profil.row.langue')}
              value={LANGUAGE_LABELS[language] ?? 'Français'}
              onPress={() => router.push('/settings')}
            />
            <Row
              Icon={SparklesIcon}
              label={t('profil.row.theme')}
              value={THEME_LABELS[preference] ?? THEME_LABELS.system}
              onPress={() => router.push('/settings/theme')}
            />
            <Row
              Icon={CloudOff}
              label={t('profil.row.dataSaver')}
              sub={t('profil.row.dataSaverSub')}
              right={<Switch value={dataSaver} onChange={setDataSaver} />}
            />
            <Row
              Icon={Eye}
              label={t('profil.row.privacy')}
              onPress={() => router.push('/settings/privacy')}
              divider={false}
            />
          </SettingsCard>
        </View>

        {/* ===== À propos ===== */}
        <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
          <SectionLabel label={t('profil.section.about')} />
          <SettingsCard>
            <Row
              Icon={Info}
              label={t('profil.row.aboutLinky')}
              value="v0.1.0"
              onPress={() => router.push('/settings/about')}
            />
            <Row
              Icon={MessageCircle}
              label={t('profil.row.help')}
              onPress={() => router.push('/settings/help')}
            />
            <Row
              Icon={FileText}
              label={t('profil.row.terms')}
              onPress={() => router.push('/settings/terms')}
            />
            <Row
              Icon={Shield}
              label={t('profil.row.privacyPolicy')}
              onPress={() => router.push('/settings/privacy-policy')}
              divider={false}
            />
          </SettingsCard>
        </View>

        {/* ===== Logout ===== */}
        <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
          <Pressable
            onPress={async () => {
              haptic.light();
              // Needs the still-valid bearer, so it runs BEFORE signOut wipes
              // the tokens. Internally capped + catch-all : never blocks logout.
              await unregisterPushToken();
              await signOut();
              router.replace('/(onboarding)/welcome');
            }}
            style={{
              height: 52,
              borderRadius: 16,
              backgroundColor: 'rgba(209,79,60,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(209,79,60,0.25)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <LogOut size={16} color={colors.danger} strokeWidth={2} />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: colors.danger,
                letterSpacing: 0,
                lineHeight: 17,
                includeFontPadding: false,
              }}
            >
              {t('profil.logout')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ===================================================================
// Subcomponents
// ===================================================================

function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: colors.textFaint,
        letterSpacing: 0.6,
        marginBottom: 10,
        marginLeft: 4,
      }}
    >
      {label.toUpperCase()}
    </Text>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function Row({
  Icon,
  label,
  sub,
  value,
  right,
  onPress,
  divider = true,
}: {
  Icon: LucideIcon;
  label: string;
  sub?: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={16} color={colors.text} strokeWidth={1.75} />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14.5,
            fontWeight: '600',
            color: colors.text,
            letterSpacing: 0,
            lineHeight: 18,
            includeFontPadding: false,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sub && (
          <Text
            style={{
              fontSize: 12,
              color: colors.textMuted,
              marginTop: 2,
              letterSpacing: 0,
              lineHeight: 15,
            }}
            numberOfLines={1}
          >
            {sub}
          </Text>
        )}
      </View>

      {value && (
        <Text
          style={{
            fontSize: 13,
            color: colors.textMuted,
            letterSpacing: 0,
          }}
        >
          {value}
        </Text>
      )}
      {right}
      {!right && onPress && (
        <ChevronRight size={16} color={colors.textFaint} strokeWidth={2} />
      )}
    </Pressable>
  );
}

// Phase X.10 (revised) — prominent entry into a pro's workspace, replaces
// the old hidden boutique tab + Home-header Store shortcut. Sellers see one,
// agents see another, dual-role users see both stacked.
function BoutiqueHero({
  Icon,
  title,
  sub,
  ctaLabel,
}: {
  Icon: LucideIcon;
  title: string;
  sub: string;
  ctaLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        router.push('/(tabs)/boutique');
      }}
      accessibilityRole="button"
      accessibilityLabel={ctaLabel}
      style={{
        padding: 18,
        borderRadius: 20,
        backgroundColor: colors.primarySoft,
        borderWidth: 1,
        borderColor: 'rgba(15,114,86,0.18)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={24} color="#FFFFFF" strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: colors.primaryDeep,
            letterSpacing: -0.1,
            lineHeight: 20,
            includeFontPadding: false,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: 12.5,
            color: colors.primaryDeep,
            opacity: 0.75,
            marginTop: 3,
            letterSpacing: 0,
            lineHeight: 16,
          }}
        >
          {sub}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: colors.primary,
            marginTop: 8,
            letterSpacing: 0.2,
          }}
        >
          {ctaLabel} →
        </Text>
      </View>
    </Pressable>
  );
}
