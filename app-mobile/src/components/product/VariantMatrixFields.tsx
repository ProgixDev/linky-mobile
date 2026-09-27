import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Input } from '../primitives/Input';
import { Switch } from '../primitives/Switch';
import { I } from '../../icons/Icon';
import { haptic } from '../../lib/haptics';
import {
  combos,
  comboKey,
  totalStock,
  MAX_AXIS_LEN,
  MAX_VARIANTS,
  type VariantsDraft,
} from '../../lib/variantsDraft';

// LA MATRICE TAILLE / COULEUR, côté vendeur.
//
// ┌─ POURQUOI DEUX LISTES ET PAS UN TABLEAU ────────────────────────────────┐
// Le client a écrit sa demande ainsi : « Taille 41 (Noire, rouge, bleue) /
// Taille 44 (Noire, rouge, bleue) ». Il pense en deux listes et laisse le
// croisement se faire tout seul. Lui faire saisir dix-huit lignes à la main
// serait fidèle au modèle de données et infidèle à sa façon de compter — sur un
// téléphone d'entrée de gamme, ce serait surtout l'assurance qu'il abandonne
// avant la fin.
//
// Il saisit donc ses tailles, ses couleurs, et l'application affiche les
// combinaisons à remplir. Six tailles et trois couleurs font dix-huit lignes de
// quantité : c'est beaucoup, mais c'est la réalité de son stock, et chaque
// ligne ne demande qu'un chiffre.
// └─────────────────────────────────────────────────────────────────────────┘

export function VariantMatrixFields({
  value,
  onChange,
  fallbackStock,
}: {
  value: VariantsDraft;
  onChange: (next: VariantsDraft) => void;
  /** La quantité simple de l'annonce, montrée quand l'option est décochée. */
  fallbackStock?: number;
}) {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const set = (patch: Partial<VariantsDraft>) => onChange({ ...value, ...patch });

  const list = combos(value);
  const total = totalStock(value);

  // ┌─ LA LIMITE SE DIT ICI, OU ELLE EST ENCORE UTILE ───────────────────────┐
  // Au-delà de vingt combinaisons, le serveur refuse dans sa validation de
  // FORME — donc avant le handler, avec le « Corps invalide » générique, sans
  // dire ni la règle ni le nombre. Le message soigné écrit dans les deux
  // fonctions edge est inatteignable par construction.
  //
  // Un vendeur de chaussures qui saisit 5 tailles et 5 couleurs traversait donc
  // tout le tunnel, téléversait ses photos, remplissait 25 cases, et lisait
  // « Corps invalide ». On refuse maintenant la valeur de trop AU MOMENT où il
  // l'ajoute, en disant combien il en reste — c'est le seul instant où
  // l'information sert à quelque chose.
  // └───────────────────────────────────────────────────────────────────────┘
  const fits = (patch: Partial<VariantsDraft>) =>
    combos({ ...value, ...patch }).length <= MAX_VARIANTS;
  const canAddSize = fits({ sizes: [...value.sizes, '\u0000probe'] });
  const canAddColor = fits({ colors: [...value.colors, '\u0000probe'] });
  const tooMany = t('create.variantsTooMany', { max: MAX_VARIANTS });

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
            {t('create.variantsTitle')}
          </Text>
          <Text
            variant="micro"
            tone="muted"
            style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}
          >
            {t('create.variantsHint')}
          </Text>
        </View>
        <Switch
          value={value.enabled}
          onChange={(v: boolean) => {
            haptic.light();
            set({ enabled: v });
          }}
        />
      </View>

      {value.enabled && (
        <View style={{ gap: 12 }}>
          <TagField
            label={t('create.variantsSizes')}
            placeholder={t('create.variantsSizesPlaceholder')}
            values={value.sizes}
            onChange={(sizes) => set({ sizes })}
            canAdd={canAddSize}
            blockedMessage={tooMany}
          />
          <TagField
            label={t('create.variantsColors')}
            placeholder={t('create.variantsColorsPlaceholder')}
            values={value.colors}
            onChange={(colors) => set({ colors })}
            canAdd={canAddColor}
            blockedMessage={tooMany}
          />

          {list.length === 0 ? (
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
              {t('create.variantsEmpty')}
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              <Text variant="micro" tone="muted" style={{ letterSpacing: 0.4 }}>
                {t('create.variantsCount', { count: list.length })}
              </Text>

              {list.map((c) => {
                const k = comboKey(c.size, c.color);
                const qty = value.stock[k];
                return (
                  <View
                    key={k}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                    }}
                  >
                    <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>
                      {[c.size, c.color].filter(Boolean).join(' · ')}
                    </Text>
                    <View style={{ width: 88 }}>
                      <Input
                        label=""
                        value={qty === null || qty === undefined ? '' : String(qty)}
                        placeholder={t('create.variantsQtyPlaceholder')}
                        onChangeText={(txt) => {
                          const digits = txt.replace(/\D/g, '');
                          set({
                            stock: {
                              ...value.stock,
                              // Un champ VIDE veut dire « je ne compte pas »,
                              // pas « zéro ». Les confondre mettrait en rupture
                              // une combinaison que le vendeur a simplement
                              // laissée de côté.
                              [k]: digits === '' ? null : Number(digits),
                            },
                          });
                        }}
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>
                );
              })}

              <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                {total === null
                  ? t('create.variantsTotalUnknown')
                  : t('create.variantsTotal', { count: total })}
              </Text>
            </View>
          )}
        </View>
      )}

      {!value.enabled && fallbackStock !== undefined && (
        <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
          {t('create.variantsOffHint', { count: fallbackStock })}
        </Text>
      )}
    </View>
  );
}

/** Une liste de valeurs qu'on ajoute une par une, et qu'on retire d'un toucher. */
function TagField({
  label,
  placeholder,
  values,
  onChange,
  canAdd,
  blockedMessage,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
  /** Faux quand une valeur de plus dépasserait le plafond de combinaisons. */
  canAdd: boolean;
  blockedMessage: string;
}) {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [blocked, setBlocked] = useState(false);

  const commit = () => {
    const v = draft.trim();
    if (v === '') return;
    // Le doublon est refusé en silence : le vendeur voit que rien ne s'ajoute
    // parce que la valeur est déjà là, juste au-dessus. Le plafond, lui, se
    // DIT : rien à l'écran ne permettrait de le deviner.
    if (values.includes(v)) {
      setDraft('');
      return;
    }
    if (!canAdd) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    onChange([...values, v]);
    setDraft('');
  };

  return (
    <View style={{ gap: 8 }}>
      {/* Le bouton « + » est A COTE du champ et non dedans : Input n'accepte
          qu'une icone decorative, pas un element touchable. « Entree » valide
          aussi — sur beaucoup de claviers Android la touche est remplacee par
          un saut de ligne, et un champ qui n'a qu'une facon d'etre valide finit
          toujours par en manquer une. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Input
            label={label}
            value={draft}
            onChangeText={(txt) => {
              // maxLength plutot qu'un refus a l'enregistrement : au-dela de 40
              // signes le serveur rend « Corps invalide », sans dire quel champ.
              setDraft(txt.slice(0, MAX_AXIS_LEN));
              if (blocked) setBlocked(false);
            }}
            placeholder={placeholder}
            returnKeyType="done"
            onSubmitEditing={commit}
          />
        </View>
        <Pressable
          onPress={() => { haptic.light(); commit(); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('create.variantsAdd')}
          style={{
            width: 46, height: 46, borderRadius: radii.md,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1,
            borderColor: !canAdd ? colors.border : draft.trim() ? colors.primary : colors.border,
            backgroundColor: !canAdd
              ? colors.bgSunken
              : draft.trim() ? colors.primarySoft : colors.card,
            opacity: canAdd ? 1 : 0.5,
          }}
        >
          <I.plus size={18} color={canAdd && draft.trim() ? colors.primary : colors.textFaint} />
        </Pressable>
      </View>
      {blocked && (
        <Text variant="micro" tone="danger" style={{ letterSpacing: 0, textTransform: 'none' }}>
          {blockedMessage}
        </Text>
      )}
      {values.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {values.map((v) => (
            <Pressable
              key={v}
              onPress={() => {
                haptic.light();
                onChange(values.filter((x) => x !== v));
              }}
              accessibilityRole="button"
              accessibilityLabel={t('create.variantsRemove', { value: v })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bgSunken,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600' }}>{v}</Text>
              <I.close size={12} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
