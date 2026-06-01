import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { I } from '../../src/icons/Icon';
import { haptic } from '../../src/lib/haptics';

// Strict QR payload: linky://order/<uuid>/confirm?token=<uuid>
// Both id and token are 36-char hex+dash UUIDs. Anything else fails parsing.
// The token is the QR-gate secret (migration 20260601_03) — without it,
// confirm-receipt would 400 server-side. We reject pre-token QRs at the
// scanner layer so the buyer gets a clear "QR obsolète" hint, not a
// cryptic server error mid-hold.
const STRICT_RE = /^linky:\/\/order\/([0-9a-f-]{36})\/confirm\?token=([0-9a-f-]{36})\/?$/i;
// Old-format QR (no token): matches when someone scans a pre-migration code.
const OBSOLETE_RE = /^linky:\/\/order\/[0-9a-f-]{36}\/confirm\/?$/i;

function parseLinkyConfirmUrl(raw: string): { id: string; token: string } | null {
  const match = raw.match(STRICT_RE);
  if (!match) return null;
  return { id: match[1]!, token: match[2]! };
}

function isObsoleteQr(raw: string): boolean {
  return OBSOLETE_RE.test(raw);
}

export default function ScanRoute() {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    const parsed = parseLinkyConfirmUrl(data);
    if (!parsed) {
      // Distinguish obsolete pre-token QRs from random QR codes so the buyer
      // knows to ask the seller for a freshly-printed code rather than think
      // the scanner is broken.
      if (isObsoleteQr(data)) {
        setError("Ce QR est obsolète. Demande au vendeur de générer un nouveau code.");
      } else {
        setError('Ce QR ne correspond pas à une commande Linky.');
      }
      return;
    }
    handled.current = true;
    haptic.success();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new route + query param, typedRoutes regenerates on next expo start
    router.replace(`/order/${parsed.id}/confirm?token=${parsed.token}` as any);
  };

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: '#0E1311' }} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        style={{ flex: 1, backgroundColor: '#0E1311', padding: 32, justifyContent: 'center', alignItems: 'center', gap: 18 }}
      >
        <I.camera size={36} color="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '600', textAlign: 'center' }}>
          Autorise l&apos;appareil photo
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
          Linky a besoin d&apos;accéder à la caméra pour scanner le QR code collé sur le colis.
        </Text>
        <Button variant="primary" block label="Autoriser" onPress={() => requestPermission()} />
        <Button
          variant="ghost"
          block
          label="Retour"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/orders'))}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0E1311' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      <SafeAreaView
        edges={['top', 'bottom']}
        pointerEvents="box-none"
        style={{ ...absoluteFill, justifyContent: 'space-between', paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/orders'))}
            accessibilityLabel="Fermer"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <I.close size={18} color="#FFFFFF" />
          </Pressable>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.45)',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
              Scanner un QR
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ alignSelf: 'center', width: 240, height: 240, borderRadius: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' }} />

        <View style={{ alignItems: 'center', gap: 8, paddingBottom: 8 }}>
          {error ? (
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: 'rgba(180,40,30,0.85)',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12.5, textAlign: 'center' }}>{error}</Text>
            </View>
          ) : (
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center' }}>
              Pointe l&apos;appareil sur le code collé sur le colis.
            </Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const absoluteFill = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
