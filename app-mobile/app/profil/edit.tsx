// Phase T.2 — small "Modifier mon profil" screen. The Pressable on profil
// previously had no onPress ; this is the smallest correct fix : edit
// display_name + city via the existing update-profile endpoint, no avatar
// upload yet (deferred to V1.1 — needs the photo-upload-url storage flow).
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, User as UserIcon } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { CityMapPicker } from '../../src/components/onboarding/CityMapPicker';
import { useAuth } from '../../src/stores/auth';
import { useUpdateProfile } from '../../src/data/queries/auth';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';

export default function ProfilEditRoute() {
  const { colors } = useTheme();
  const currentUser = useAuth((s) => s.user);
  const signIn = useAuth((s) => s.signIn);
  const updateProfile = useUpdateProfile();
  const toast = useToast();

  const [name, setName] = useState(currentUser?.display_name ?? '');
  const [city, setCity] = useState(currentUser?.city ?? '');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [focusName, setFocusName] = useState(false);

  const dirty =
    name.trim() !== (currentUser?.display_name ?? '') ||
    city.trim() !== (currentUser?.city ?? '');
  const canSave = dirty && !!name.trim();

  const onSave = async () => {
    if (!canSave || updateProfile.isPending) return;
    try {
      const res = await updateProfile.mutateAsync({
        display_name: name.trim(),
        city: city.trim(),
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
