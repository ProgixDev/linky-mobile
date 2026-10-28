import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Card } from '../../src/components/primitives/Card';
import { TopBar } from '../../src/components/nav/TopBar';
import { I, type IconKey } from '../../src/icons/Icon';
import { useCreateListing } from '../../src/stores/createListing';
import { useAuth } from '../../src/stores/auth';

interface TypeOption {
  kind: 'product' | 'property';
  titleKey: string;
  descKey: string;
  icon: IconKey;
  requires: 'seller' | 'agent';
}

// Phase I.8 — OPTIONS carry i18n keys ; component resolves at render via t().
const OPTION_DEFS: TypeOption[] = [
  { kind: 'product', titleKey: 'create.kindProductTitle', descKey: 'create.kindProductDesc', icon: 'store', requires: 'seller' },
  { kind: 'property', titleKey: 'create.kindPropertyTitle', descKey: 'create.kindPropertyDesc', icon: 'building', requires: 'agent' },
];

export default function CreateTypeRoute() {
  const { colors, theme } = useTheme();
  const { t } = useTranslation();
  const roles = useAuth((s) => s.roles);
  const setKind = useCreateListing((s) => s.setKind);
  const reset = useCreateListing((s) => s.reset);
  // LES DEUX CHOIX, TOUJOURS (client 2026-10-28) : « renvoyer vers la page de
  // publication de Articles + Immo ». Avant, la page ne montrait que ce que le
  // rôle permettait — son propre compte (acheteur + agent) n'y voyait que
  // « Bien immobilier », un simple acheteur qu'une carte « active un rôle ».
  // Un choix dont le rôle manque reste visible, le dit, et mène à l'activation
  // de ce rôle (/profil/devenir), qui ramène ici une fois le rôle actif.
  const options = useMemo(
    () =>
      OPTION_DEFS.map((o) => ({
        ...o,
        title: t(o.titleKey),
        desc: t(o.descKey),
        allowed: roles.includes(o.requires),
      })),
    [roles, t],
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('boutique.newListingProduct')} back />
      <View style={{ paddingHorizontal: 16 }}>
        <Text variant="dispL" style={{ fontSize: 22, marginBottom: 18 }}>
          {t('create.selectKindTitle')}
        </Text>
        {options.map((o) => {
          const Icon = I[o.icon];
          return (
            <Pressable
              key={o.kind}
              onPress={() => {
                if (!o.allowed) {
                  router.push(`/profil/devenir?role=${o.requires}` as never);
                  return;
                }
                reset();
                setKind(o.kind);
                router.push(o.kind === 'product' ? '/create/product/seller' : '/create/property/owner');
              }}
              accessibilityRole="button"
              accessibilityLabel={o.allowed ? o.title : `${o.title}. ${t(o.requires === 'seller' ? 'create.needsSellerRole' : 'create.needsAgentRole')}`}
              style={{ marginBottom: 10 }}
            >
              <Card padding={16}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: colors.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleM" style={{ fontSize: 14 }}>
                      {o.title}
                    </Text>
                    <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                      {o.desc}
                    </Text>
                    {!o.allowed && (
                      <Text
                        variant="micro"
                        style={{ letterSpacing: 0, textTransform: 'none', marginTop: 4, color: theme === 'dark' ? colors.accent : colors.accentText }}
                      >
                        {t(o.requires === 'seller' ? 'create.needsSellerRole' : 'create.needsAgentRole')}
                      </Text>
                    )}
                  </View>
                  <I.chevronR size={16} color={colors.textMuted} />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
