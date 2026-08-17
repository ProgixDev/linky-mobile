import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, useWindowDimensions, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Camera, User as UserIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { I, type IconKey } from '../../src/icons/Icon';
import { roleHeroes } from '../../src/data/photos';
import { CityMapPicker } from '../../src/components/onboarding/CityMapPicker';
import { ROLE_FROM_UI, useAuth } from '../../src/stores/auth';
import * as ImagePicker from 'expo-image-picker';
import { useUpdateProfile, useUploadAvatar, type AvatarMime } from '../../src/data/queries/auth';
import { useToast } from '../../src/components/feedback/Toast';

type RoleId = 'buy' | 'sell' | 'agent';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export default function ProfileSetupRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const setRolesInStore = useAuth((s) => s.setRoles);
  const signIn = useAuth((s) => s.signIn);
  const currentUser = useAuth((s) => s.user);
  const updateProfile = useUpdateProfile();
  const toast = useToast();
  const uploadAvatar = useUploadAvatar();
  const [avatarUrl, setAvatarUrl] = useState('');

  // Photo de profil des l'inscription (client 2026-08-17). Meme mecanique que
  // Profil -> Modifier : on televerse tout de suite et on garde l'URL, que
  // l'enregistrement du profil transmettra avec le nom et la ville. La photo
  // reste FACULTATIVE : elle ne conditionne pas le bouton Continuer.
  const onPickAvatar = async () => {
    if (uploadAvatar.isPending) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show("Autorise l'accès aux photos pour ajouter ta photo.", 'danger');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.9,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    const asset = picked.assets[0];
    const m = asset.mimeType?.toLowerCase();
    const mime: AvatarMime =
      m === 'image/png' || m === 'image/webp' || m === 'image/jpeg' ? m : 'image/jpeg';
    try {
      setAvatarUrl(await uploadAvatar.mutateAsync({ uri: asset.uri, mime }));
    } catch {
      toast.show('Téléversement de la photo échoué.', 'danger');
    }
  };
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [roles, setRoles] = useState<Set<string>>(new Set());

  // Phase I.3b — ROLES + LABELS + TITLES were module-scope, freezing copy
  // at the language i18next first resolved. Memo inside the component so
  // language switches re-render.
  const ROLES = useMemo(
    () => [
      { id: 'buy' as const, title: t('onboarding.profile.roleBuyTitle'), desc: t('onboarding.profile.roleBuyDesc'), icon: 'cart' as IconKey, image: roleHeroes.buy },
      { id: 'sell' as const, title: t('onboarding.profile.roleSellTitle'), desc: t('onboarding.profile.roleSellDesc'), icon: 'store' as IconKey, image: roleHeroes.sell },
      { id: 'agent' as const, title: t('onboarding.profile.roleAgentTitle'), desc: t('onboarding.profile.roleAgentDesc'), icon: 'building' as IconKey, image: roleHeroes.agent },
    ],
    [t],
  );
  const LABELS = useMemo(
    () => [t('onboarding.profile.labelIdentite'), t('onboarding.profile.labelVille'), t('onboarding.profile.labelRole')],
    [t],
  );
  const TITLES = useMemo(
    () => [t('onboarding.profile.titleIdentite'), t('onboarding.profile.titleVille'), t('onboarding.profile.titleRole')],
    [t],
  );

  const toggleRole = (id: string) => {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const next = async () => {
    if (step < 2) {
      setStep((s) => s + 1);
      return;
    }
    // T.1.fix — re-entrancy guard. Without this, a double-tap on Terminer
    // (or Retour mid-await) fires two update-profile mutations and the
    // second one can race with router.replace.
    if (updateProfile.isPending) return;
    // Phase T.1 — persist BOTH locally (for instant UI) AND on the server
    // (so a reinstall / second device rehydrates from the source of truth).
    // Best-effort: server failure does NOT block onboarding ; we still
    // preserve every field locally via the auth store so MMKV is the
    // recovery path on next boot.
    const trimmedName = name.trim();
    const trimmedCity = city.trim();
    const canonical = Array.from(roles).map(
      (id) => ROLE_FROM_UI[id as 'buy' | 'sell' | 'agent'],
    );
    setRolesInStore(canonical);
    try {
      const res = await updateProfile.mutateAsync({
        display_name: trimmedName,
        city: trimmedCity,
        roles: canonical,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      });
      if (currentUser) {
        signIn({ ...currentUser, ...res.user });
      }
    } catch {
      // T.1.fix — also persist display_name + city locally so the toast
      // message is true. Without this, MMKV holds nothing for those fields
      // and the user sees their name vanish on the next screen.
      if (currentUser) {
        signIn({
          ...currentUser,
          display_name: trimmedName || currentUser.display_name,
          city: trimmedCity || (currentUser.city ?? null),
          roles: canonical,
        });
      }
      toast.show(t('onboarding.profile.savedLocal'), 'info');
    }
    router.replace('/(onboarding)/done');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 }}>
          {/* 3-segment progress */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 22 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 999,
                  backgroundColor: i <= step ? colors.primary : colors.bgSunken,
                }}
              />
            ))}
          </View>

          {/* Pill header */}
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: colors.primarySoft,
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primaryDeep, letterSpacing: 0.4 }}>
              {t('onboarding.profile.stepBadge', { current: step + 1, total: 3, label: LABELS[step] })}
            </Text>
          </View>

          <Text variant="dispL" style={{ fontSize: 28, lineHeight: 34 }}>
            {TITLES[step]}
          </Text>

          <View style={{ flex: 1, marginTop: 22 }}>
            {step === 0 && (
              <IdentityStep
                name={name}
                setName={setName}
                avatarUrl={avatarUrl}
                onPickAvatar={onPickAvatar}
                uploading={uploadAvatar.isPending}
              />
            )}

            {step === 1 && <CityMapPicker value={city} onChange={setCity} />}

            {step === 2 && (
              <View style={{ gap: 10 }}>
                <Text
                  variant="bodyM"
                  tone="muted"
                  style={{ fontSize: 14, lineHeight: 20, letterSpacing: 0, marginBottom: 4 }}
                >
                  {t('onboarding.profile.rolesHelp')}
                </Text>
                {ROLES.map((r) => (
                  <RoleCard
                    key={r.id}
                    role={r}
                    selected={roles.has(r.id)}
                    onToggle={() => toggleRole(r.id)}
                  />
                ))}
              </View>
            )}
          </View>

          {/* flexShrink:0 — the action row must never be squeezed by a tall
              step (the map step pushed it off-screen entirely, client
              2026-08-06). Belt-and-braces with the map's own maxHeight. */}
          <View style={{ flexDirection: 'row', gap: 8, paddingTop: 12, flexShrink: 0 }}>
            <Button
              variant="outline"
              size="lg"
              label={t('common.back')}
              style={{ flex: 1 }}
              onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
              disabled={updateProfile.isPending}
            />
            <Button
              variant="dark"
              size="lg"
              label={step === 2 ? t('onboarding.profile.finish') : t('common.continue')}
              style={{ flex: 2 }}
              onPress={next}
              loading={step === 2 && updateProfile.isPending}
              disabled={
                (step === 0 && !name.trim()) ||
                (step === 1 && !city) ||
                (step === 2 && roles.size === 0) ||
                updateProfile.isPending
              }
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function IdentityStep({
  name,
  setName,
  avatarUrl,
  onPickAvatar,
  uploading,
}: {
  name: string;
  setName: (v: string) => void;
  avatarUrl: string;
  onPickAvatar: () => void;
  uploading: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View>
      {/* Photo de profil, ajoutable des l'inscription (client 2026-08-17). Le
          cercle etait auparavant decoratif : il ressemblait a un bouton sans en
          etre un, et la photo ne pouvait s'ajouter qu'apres coup depuis les
          reglages. Elle reste facultative — elle ne bloque pas Continuer. */}
      <View style={{ alignItems: 'center', marginBottom: 26 }}>
        <Pressable
          onPress={onPickAvatar}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={avatarUrl ? 'Changer la photo de profil' : 'Ajouter une photo de profil'}
        >
          {/* Le rognage doit rester SUR le cercle, pas sur le conteneur : la
              pastille debordant vers le bas-droit serait sinon coupee. */}
          <View
            style={{
              width: 104,
              height: 104,
              borderRadius: 999,
              backgroundColor: colors.bgSunken,
              borderWidth: 3,
              borderColor: colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <UserIcon size={40} color={colors.textFaint} strokeWidth={1.5} />
            )}
          </View>
          {/* Pastille verte, identique a celle de Profil -> Modifier : c'est elle
              qui dit que le cercle est cliquable. Sans elle, l'utilisateur voit
              un simple emplacement vide et passe a cote (client 2026-08-17). */}
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 32,
              height: 32,
              borderRadius: 999,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: colors.bg,
            }}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Camera size={16} color="#FFFFFF" strokeWidth={2} />
            )}
          </View>
        </Pressable>
        {/* Sans ce libelle, rien n'indique que le cercle est cliquable. */}
        <Text variant="caption" tone="muted" style={{ marginTop: 8, letterSpacing: 0 }}>
          {avatarUrl ? 'Changer la photo' : 'Ajouter une photo (facultatif)'}
        </Text>
      </View>

      {/* Inputs */}
      <View style={{ gap: 14 }}>
        <IdField
          label={t('onboarding.profile.nameLabel')}
          value={name}
          onChangeText={setName}
          placeholder={t('onboarding.profile.namePlaceholder')}
          Icon={UserIcon}
        />
      </View>
    </View>
  );
}

function IdField({
  label,
  value,
  onChangeText,
  placeholder,
  Icon,
  optional,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  Icon: typeof UserIcon;
  optional?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6 }}>
          {label}
        </Text>
        {optional && (
          <Text style={{ fontSize: 10, color: colors.textFaint, letterSpacing: 0 }}>
            · {t('onboarding.profile.optional')}
          </Text>
        )}
      </View>
      <View
        style={{
          height: 56,
          paddingHorizontal: 14,
          borderRadius: 16,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? colors.primary : colors.border,
          backgroundColor: colors.card,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Icon size={18} color={focused ? colors.primary : colors.textMuted} strokeWidth={1.75} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            fontSize: 15.5,
            fontWeight: '500',
            color: colors.text,
            padding: 0,
          }}
        />
      </View>
    </View>
  );
}

function RoleCard({
  role,
  selected,
  onToggle,
}: {
  role: { id: RoleId; title: string; desc: string; icon: IconKey; image: number };
  selected: boolean;
  onToggle: () => void;
}) {
  const { colors, radii } = useTheme();
  const screenW = Math.min(useWindowDimensions().width, 500);
  const Icon = I[role.icon];

  // Responsive sizing — scales with screen width but stays within sensible bounds.
  // Reference: iPhone 13 (390pt). Tiny phones (≤360) clamp to min; big phones cap.
  const collapsedH = clamp(Math.round(screenW * 0.235), 84, 104);
  const expandedH = clamp(Math.round(screenW * 0.46), 168, 210);
  const imageW = clamp(Math.round(screenW * 0.42), 150, 200);
  const iconSize = clamp(Math.round(screenW * 0.062), 22, 28);
  const titleSize = clamp(Math.round(screenW * 0.04), 15, 18);
  const descSize = clamp(Math.round(screenW * 0.034), 12.5, 14.5);
  const checkBox = clamp(Math.round(screenW * 0.065), 24, 28);

  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [selected, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    height: collapsedH + (expandedH - collapsedH) * progress.value,
  }));

  const imageStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: 16 * (1 - progress.value) },
      { scale: 0.92 + 0.08 * progress.value },
    ],
  }));

  // Check fades OUT as the image fades in — they swap on the right side.
  const checkStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  return (
    <Pressable onPress={onToggle}>
      <Animated.View
        style={[
          {
            borderRadius: radii.md,
            borderWidth: selected ? 2 : 1,
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: colors.card,
            overflow: 'hidden',
            paddingHorizontal: 16,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
          },
          cardStyle,
        ]}
      >
        {selected ? (
          // Expanded: icon stacks above the text on the left side.
          <View style={{ flex: 1, gap: 4 }}>
            <Icon size={iconSize} color={colors.primary} />
            <Text variant="titleM" style={{ fontSize: titleSize, marginTop: 6 }}>
              {role.title}
            </Text>
            <Text
              variant="micro"
              tone="muted"
              style={{ letterSpacing: 0, textTransform: 'none', fontSize: descSize }}
            >
              {role.desc}
            </Text>
          </View>
        ) : (
          // Collapsed: icon sits to the left of the text, both vertically centered.
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon size={iconSize} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Text variant="titleM" style={{ fontSize: titleSize }}>
                {role.title}
              </Text>
              <Text
                variant="micro"
                tone="muted"
                style={{ letterSpacing: 0, textTransform: 'none', fontSize: descSize, marginTop: 2 }}
              >
                {role.desc}
              </Text>
            </View>
          </View>
        )}

        {/* Character image — only visible when selected. Pinned close to right edge. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              right: 8,
              bottom: 0,
              top: 0,
              width: imageW,
            },
            imageStyle,
          ]}
        >
          <Image
            source={role.image}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            contentPosition="bottom"
          />
        </Animated.View>

        {/* Empty selection circle — fades out as the image fades in */}
        <Animated.View
          style={[
            {
              width: checkBox,
              height: checkBox,
              borderRadius: 999,
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              borderColor: colors.borderStrong,
              alignItems: 'center',
              justifyContent: 'center',
            },
            checkStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
