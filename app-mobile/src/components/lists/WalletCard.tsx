import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { I } from '../../icons/Icon';
import { formatGNF, formatEUR } from '../../lib/format';
import { gnfToEur } from '../../lib/currency';
import { haptic } from '../../lib/haptics';

export function WalletGlanceCard({
  balanceGnf,
  onRecharger,
  onRetirer,
  onEnvoyer,
  large = false,
}: {
  balanceGnf: number;
  onRecharger?: () => void;
  onRetirer?: () => void;
  onEnvoyer?: () => void;
  large?: boolean;
}) {
  const { radii } = useTheme();
  return (
    <LinearGradient
      colors={['#0E6E55', '#0A5240', '#0A5240']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radii.lg, padding: 18, overflow: 'hidden' }}
    >
      <View
        style={{
          position: 'absolute',
          right: -30,
          top: -30,
          width: 160,
          height: 160,
          borderRadius: 999,
          backgroundColor: 'rgba(232,165,61,0.25)',
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 11, color: '#FFFFFF', opacity: 0.7, letterSpacing: 0.4, fontWeight: '600' }}>
            {large ? 'SOLDE DISPONIBLE' : 'WALLET LINKY'}
          </Text>
          <Text
            style={{
              fontSize: large ? 32 : 24,
              fontWeight: '700',
              color: '#FFFFFF',
              marginTop: 4,
              fontVariant: ['tabular-nums'],
            }}
          >
            {large ? formatGNF(balanceGnf).replace(' GNF', '') : formatGNF(balanceGnf)}
          </Text>
          <Text style={{ fontSize: 11, color: '#FFFFFF', opacity: 0.85, fontVariant: ['tabular-nums'] }}>
            {large ? 'GNF · ' : ''}
            {formatEUR(gnfToEur(balanceGnf))}
          </Text>
        </View>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <I.wallet size={18} color="#FFFFFF" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {/* Top-up removed (wallet restructure) — the button only renders when a
            caller passes onRecharger, and no caller does while
            WALLET_TOPUP_ENABLED is false. */}
        {onRecharger && (
          <Pressable
            onPress={() => {
              haptic.light();
              onRecharger();
            }}
            style={{
              flex: 1,
              height: large ? 40 : 36,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.18)',
              flexDirection: 'row',
              gap: 5,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <I.plus size={14} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 12 }}>Recharger</Text>
          </Pressable>
        )}
        {onEnvoyer && (
          <Pressable
            onPress={() => {
              haptic.light();
              onEnvoyer();
            }}
            style={{
              flex: 1,
              height: large ? 40 : 36,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.18)',
              flexDirection: 'row',
              gap: 5,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <I.upload size={14} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 12 }}>Envoyer</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            haptic.light();
            onRetirer?.();
          }}
          style={{
            flex: 1,
            height: large ? 40 : 36,
            borderRadius: 999,
            backgroundColor: large ? '#FFFFFF' : 'rgba(255,255,255,0.18)',
            flexDirection: 'row',
            gap: 5,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <I.download size={14} color={large ? '#0A5240' : '#FFFFFF'} />
          <Text style={{ color: large ? '#0A5240' : '#FFFFFF', fontWeight: '600', fontSize: 12 }}>
            Retirer
          </Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}
