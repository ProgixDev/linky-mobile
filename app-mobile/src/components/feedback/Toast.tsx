import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';

type ToastTone = 'info' | 'success' | 'danger';
interface ToastMsg {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 90,
          alignItems: 'stretch',
          gap: 8,
        }}
      >
        {items.map((t) => (
          <ToastItem key={t.id} item={t} onDismiss={() => setItems((p) => p.filter((x) => x.id !== t.id))} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastItem({ item, onDismiss }: { item: ToastMsg; onDismiss: () => void }) {
  const { colors } = useTheme();
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  // success/danger = saturated bg → white text. info = colors.text as bg, which
  // INVERTS per theme (near-black in light, near-white in dark); its text must
  // therefore be colors.bg (the opposite) so it stays readable in both themes.
  // Previously the text was hardcoded #FFFFFF → white-on-white = the invisible
  // "barre vide" the client saw in dark mode (client 2026-07-29).
  const bg =
    item.tone === 'success' ? colors.success : item.tone === 'danger' ? colors.danger : colors.text;
  const fg = item.tone === 'info' ? colors.bg : '#FFFFFF';
  // Client 2026-08-25 : « arreter l'animation d'erreur pour tout type
  // d'alerte, definitivement ». C'etait le glissement d'entree/sortie
  // (SlideInDown/SlideOutDown) sur ce meme composant partage par TOUTES les
  // alertes de l'app — succes, info, erreur. Retire ici une fois : elles
  // apparaissent et disparaissent desormais sans transition, partout.
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
      }}
    >
      <Text style={{ color: fg, fontSize: 13 }}>{item.message}</Text>
    </View>
  );
}

export function useToast() {
  const c = useContext(ToastContext);
  if (!c) throw new Error('useToast must be used inside ToastProvider');
  return c;
}

