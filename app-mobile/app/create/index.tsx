import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Card } from '../../src/components/primitives/Card';
import { TopBar } from '../../src/components/nav/TopBar';
import { I, type IconKey } from '../../src/icons/Icon';
import { useCreateListing } from '../../src/stores/createListing';
import { useAuth } from '../../src/stores/auth';

interface TypeOption {
  kind: 'product' | 'property';
  title: string;
  desc: string;
  icon: IconKey;
  requires: 'seller' | 'agent';
}

const OPTIONS: TypeOption[] = [
  { kind: 'product', title: 'Un article', desc: 'Mode, électronique, beauté…', icon: 'store', requires: 'seller' },
  { kind: 'property', title: 'Un bien immobilier', desc: 'Appartement, maison, terrain', icon: 'building', requires: 'agent' },
];

export default function CreateTypeRoute() {
  const { colors, radii } = useTheme();
  const roles = useAuth((s) => s.roles);
  const setKind = useCreateListing((s) => s.setKind);
  const reset = useCreateListing((s) => s.reset);
  const visibleOptions = OPTIONS.filter((o) => roles.includes(o.requires));
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Nouvelle annonce" back />
      <View style={{ paddingHorizontal: 16 }}>
        <Text variant="dispL" style={{ fontSize: 22, marginBottom: 18 }}>
          Que veux-tu publier ?
        </Text>
        {visibleOptions.length === 0 && (
          <Pressable
            onPress={() => router.push('/profil/devenir?role=seller' as never)}
            style={{ marginBottom: 10 }}
          >
            <Card padding={16}>
              <Text variant="titleM" style={{ fontSize: 14 }}>
                Active un rôle pour publier
              </Text>
              <Text
                variant="micro"
                tone="muted"
                style={{ letterSpacing: 0, textTransform: 'none', marginTop: 4 }}
              >
                Touche ici pour devenir vendeur ou agent immobilier — on
                t'explique comment ça marche.
              </Text>
            </Card>
          </Pressable>
        )}
        {visibleOptions.map((o) => {
          const Icon = I[o.icon];
          return (
            <Pressable
              key={o.kind}
              onPress={() => {
                reset();
                setKind(o.kind);
                router.push(o.kind === 'product' ? '/create/product/seller' : '/create/property/details');
              }}
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
