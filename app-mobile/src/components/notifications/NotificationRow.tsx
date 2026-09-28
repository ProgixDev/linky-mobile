import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { I, type IconKey } from '../../icons/Icon';
import { isOpenableDeeplink } from '../../lib/deeplink';
import type { AppNotification } from '../../data/types';

// UNE LIGNE DE NOTIFICATION, ET UNE SEULE DEFINITION.
//
// ┌─ POURQUOI ELLE A QUITTE L'ECRAN ────────────────────────────────────────┐
// L'Accueil montre desormais les dernieres notifications (demande du client,
// 2026-09-28). La recopier aurait ete le geste evident — et c'est exactement ce
// qui vient de couter cher ailleurs : la restitution de stock existait en deux
// exemplaires, et l'un a garde six semaines un filtre que l'autre avait recu.
//
// Ici la divergence serait moins grave mais tout aussi certaine : la pastille
// « non lu », la garde sur les liens ouvrables, le retrait du separateur aligne
// sur le texte — trois details qui ont chacun ete corriges une fois, et qui
// auraient ete a recorriger deux fois.
// └─────────────────────────────────────────────────────────────────────────┘

const ICON_FOR: Record<string, IconKey> = {
  check: 'check',
  msg: 'msg',
  bolt: 'bolt',
  star: 'star',
  heart: 'heart',
  shield: 'shield',
};

export function relativeLabel(at: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const d = new Date(at);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return t('notifications.timeNow');
  if (mins < 60) return t('notifications.timeMinutes', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('notifications.timeHours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t('notifications.timeYesterday');
  if (days < 7) return t('notifications.timeDays', { count: days });
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function NotificationRow({
  item,
  divider = true,
}: {
  item: AppNotification;
  /** Le trait sous la ligne. L'Accueil le retire sur la derniere : un
   *  separateur en fin de liste flotte sous la section au lieu de separer. */
  divider?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const Icon = I[ICON_FOR[item.iconHint] ?? 'info'];
  // NOTE: the theme has no info-soft / success-soft tokens (only primarySoft
  // and accentSoft), so message/visit tints keep a low-alpha rgba() of the
  // theme's info/success hues. Add `infoSoft`/`successSoft` to tokens.ts to
  // make these fully theme-driven.
  const tint =
    item.category === 'order'
      ? { bg: colors.primarySoft, fg: colors.primary }
      : item.category === 'message'
        ? { bg: 'rgba(58,124,168,0.1)', fg: colors.info }
        : item.category === 'visit'
          ? { bg: 'rgba(31,169,113,0.12)', fg: colors.success }
          : item.category === 'promo'
            ? { bg: colors.accentSoft, fg: colors.accentText }
            : { bg: colors.bgSunken, fg: colors.text };
  // Meme garde que le gestionnaire de tap (push.ts) : routes internes ET
  // toujours existantes.
  const canOpen = isOpenableDeeplink(item.deeplink);
  // Une seule constante pour la colonne d'icone : le retrait du separateur en
  // dessous doit tomber EXACTEMENT sous le texte. Deux valeurs ecrites a la
  // main finiraient par diverger d'un pixel ou deux, et c'est precisement ce
  // genre d'ecart qui donne l'impression d'une liste mal alignee.
  const ICON = 38;
  const GAP = 12;
  return (
    <View>
      <Pressable
        disabled={!canOpen}
        onPress={() => {
          if (canOpen) router.push(item.deeplink as never);
        }}
        android_ripple={{ color: colors.border }}
        style={{
          flexDirection: 'row',
          gap: GAP,
          paddingVertical: 12,
          // L'icone se centre sur la hauteur de la ligne plutot que de se
          // coller en haut : avec des corps de 1 a 3 lignes, un alignement
          // haut donnait des pastilles a des hauteurs toutes differentes.
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: ICON,
            height: ICON,
            borderRadius: 999,
            backgroundColor: tint.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={17} color={tint.fg} />
        </View>
        {/* minWidth: 0 — sans lui, un titre long refuse de se laisser tronquer
            et pousse la pastille « non lu » hors de l'ecran. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>
              {item.title}
            </Text>
            {/* La pastille se pose sur la ligne du titre. Elle flottait avant
                avec une marge haute fixe, donc jamais a la meme hauteur selon
                la longueur du corps. */}
            {!item.read && (
              <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.primary }} />
            )}
          </View>
          <Text
            variant="caption"
            tone="muted"
            numberOfLines={2}
            style={{ marginTop: 2, lineHeight: 17, letterSpacing: 0 }}
          >
            {item.body}
          </Text>
          <Text variant="micro" tone="faint" style={{ marginTop: 4, letterSpacing: 0, textTransform: 'none' }}>
            {relativeLabel(item.at, t)}
          </Text>
        </View>
      </Pressable>
      {/* Separateur en retrait, aligne sur le texte et non sur l'icone : c'est
          ce qui fait lire la colonne de titres comme une vraie colonne. */}
      {divider && (
        <View style={{ height: 1, backgroundColor: colors.border, marginLeft: ICON + GAP }} />
      )}
    </View>
  );
}
