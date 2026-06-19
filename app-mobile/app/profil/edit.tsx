// Phase T.2 — small "Modifier mon profil" screen. The Pressable on profil
// previously had no onPress ; this is the smallest correct fix : edit
// display_name + city via the existing update-profile endpoint, no avatar
// upload yet (deferred to V1.1 — needs the photo-upload-url storage flow).
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Camera, ChevronLeft, ChevronRight, Phone as PhoneIcon, User as UserIcon } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { CityMapPicker } from '../../src/components/onboarding/CityMapPicker';
import { useAuth } from '../../src/stores/auth';
import { useUpdateProfile, useUploadAvatar } from '../../src/data/queries/auth';
import { useMyPhones } from '../../src/data/queries';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { useTranslation } from 'react-i18next';

type AvatarMime = 'image/jpeg' | 'image/png' | 'image/webp';
function resolveMime(asset: ImagePicker.ImagePickerAsset): AvatarMime {
  const m = asset.mimeType?.toLowerCase();
  if (m === 'image/jpeg' || m === 'image/png' || m === 'image/webp') return m;
  const ext = (asset.fileName || asset.uri).toLowerCase().split('.').pop() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export default function ProfilEditRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const currentUser = useAuth((s) => s.user);
  const signIn = useAuth((s) => s.signIn);
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const toast = useToast();
  // Pre-prod: surface the primary phone read-only here so the user sees what
  // mobile-money payouts default to. Edits live on /settings/phones (multi-
  // phone CRUD with OTP verification) — putting the picker inline would
  // double the surface area for the same flow.
  const phonesQuery = useMyPhones();
  const primaryPhone = phonesQuery.data?.find((p) => p.is_primary);

  const [name, setName] = useState(currentUser?.display_name ?? '');
  const [city, setCity] = useState(currentUser?.city ?? '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar_url ?? '');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [focusName, setFocusName] = useState(false);

  const initialAvatar = currentUser?.avatar_url ?? '';
  const dirty =
    name.trim() !== (currentUser?.display_name ?? '') ||
    city.trim() !== (currentUser?.city ?? '') ||
    avatarUrl !== initialAvatar;
  const canSave = dirty && !!name.trim() && !uploadAvatar.isPending;

  const onPickAvatar = async () => {
    if (uploadAvatar.isPending) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show("Autorise l'accès aux photos pour changer ta photo.", 'danger');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    const asset = picked.assets[0];
    try {
      const url = await uploadAvatar.mutateAsync({ uri: asset.uri, mime: resolveMime(asset) });
      setAvatarUrl(url);
    } catch (e) {
      toast.show(toToastMessage(e, 'Téléversement de la photo échoué.'), 'danger');
    }
  };

  const onSave = async () => {
    if (!canSave || updateProfile.isPending) return;
    try {
      const res = await updateProfile.mutateAsync({
        display_name: name.trim(),
        city: city.trim(),
        ...(avatarUrl !== initialAvatar ? { avatar_url: avatarUrl } : {}),
      });
      if (currentUser) signIn({ ...currentUser, ...res.user });
      toast.show('Profil mis à jour.', 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/profil');
    } catch (e) {
      toast.show(toToastMessage(e, 'Impossible de mettre à jour le profil.'), 'danger');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'))}
          hitSlop={12}
          accessibilityLabel="Retour"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 }}>
          Modifier mon profil
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {/* Photo de profil */}
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <Pressable
            onPress={onPickAvatar}
            disabled={uploadAvatar.isPending}
            accessibilityRole="button"
            accessibilityLabel="Changer la photo de profil"
            style={{ width: 100, height: 100 }}
          >
            {avatarUrl ? (
              <Image
                source={avatarUrl}
                contentFit="cover"
                style={{ width: 100, height: 100, borderRadius: 999, backgroundColor: colors.bgSunken }}
                transition={120}
              />
            ) : (
              <View
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 999,
                  backgroundColor: colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <UserIcon size={40} color={colors.textMuted} strokeWidth={1.5} />
              </View>
            )}
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
              {uploadAvatar.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Camera size={16} color="#FFFFFF" strokeWidth={2} />
              )}
            </View>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 10, alignItems: 'center' }}>
            <Pressable onPress={onPickAvatar} disabled={uploadAvatar.isPending} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                {uploadAvatar.isPending ? 'Téléversement…' : 'Changer la photo'}
              </Text>
            </Pressable>
            {!!avatarUrl && !uploadAvatar.isPending && (
              <Pressable onPress={() => setAvatarUrl('')} hitSlop={8} accessibilityLabel="Retirer la photo de profil">
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger }}>Retirer</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Nom */}
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: colors.textFaint,
            letterSpacing: 0.6,
            marginTop: 18,
            marginBottom: 8,
          }}
        >
          NOM AFFICHÉ
        </Text>
        <View
          style={{
            height: 56,
            paddingHorizontal: 14,
            borderRadius: 16,
            borderWidth: focusName ? 2 : 1,
            borderColor: focusName ? colors.primary : colors.border,
            backgroundColor: colors.card,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <UserIcon size={18} color={focusName ? colors.primary : colors.textMuted} strokeWidth={1.75} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ton prénom et nom"
            placeholderTextColor={colors.textFaint}
            onFocus={() => setFocusName(true)}
            onBlur={() => setFocusName(false)}
            maxLength={60}
            style={{
              flex: 1,
              fontSize: 15.5,
              fontWeight: '500',
              color: colors.text,
              padding: 0,
            }}
          />
        </View>

        {/* Numéro principal — read-only here ; CRUD lives on /settings/phones */}
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: colors.textFaint,
            letterSpacing: 0.6,
            marginTop: 18,
            marginBottom: 8,
          }}
        >
          {t('profil.row.phones').toUpperCase()}
        </Text>
        <Pressable
          onPress={() => router.push('/settings/phones')}
          style={{
            minHeight: 56,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <PhoneIcon size={18} color={colors.textMuted} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 15.5,
                fontWeight: '500',
                color: primaryPhone ? colors.text : colors.textFaint,
                fontVariant: ['tabular-nums'],
              }}
            >
              {primaryPhone ? primaryPhone.e164 : t('settings.phones.emptyTitle')}
            </Text>
            <Text
              style={{
                fontSize: 11.5,
                color: colors.textMuted,
                marginTop: 2,
                letterSpacing: 0,
              }}
            >
              {t('profil.edit.phoneManage')}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textFaint} strokeWidth={2} />
        </Pressable>

        {/* Ville */}
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: colors.textFaint,
            letterSpacing: 0.6,
            marginTop: 18,
            marginBottom: 8,
          }}
        >
          VILLE
        </Text>
        {showCityPicker ? (
          <View style={{ height: 420 }}>
            <CityMapPicker
              value={city}
              onChange={(v) => {
                setCity(v);
                setShowCityPicker(false);
              }}
            />
          </View>
        ) : (
          <Pressable
            onPress={() => setShowCityPicker(true)}
            style={{
              height: 56,
              paddingHorizontal: 14,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 15.5,
                fontWeight: '500',
                color: city ? colors.text : colors.textFaint,
              }}
            >
              {city || 'Choisir une ville'}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
              Changer
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
        <Button
          variant="dark"
          size="lg"
          block
          label="Enregistrer"
          onPress={onSave}
          loading={updateProfile.isPending}
          disabled={!canSave}
        />
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
