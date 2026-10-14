// Tests de l'analyseur de destination de retrait.
//
//     deno test supabase/functions/_shared/withdrawal-destination_test.ts
//
// C'est le seul endroit du versement ou l'on DEDUIT quelque chose au lieu de
// le lire. Donc c'est le seul endroit ou une erreur envoie l'argent au mauvais
// numero — d'ou ces tests, qui couvrent surtout les REFUS.
import { assertEquals } from 'jsr:@std/assert@1';
import { parseWithdrawalDestination } from './withdrawal-destination.ts';

Deno.test('Orange : etiquette et prefixe concordent', () => {
  const r = parseWithdrawalDestination('Orange Money — 622 12 45 78');
  assertEquals(r, { ok: true, target: { account: '622124578', type_account: 'lp-om-gn' } });
});

Deno.test('MTN : etiquette et prefixe concordent', () => {
  const r = parseWithdrawalDestination('MTN Mobile Money — 664 00 11 22');
  assertEquals(r, { ok: true, target: { account: '664001122', type_account: 'lp-momo-gn' } });
});

Deno.test('indicatif +224 tolere', () => {
  const r = parseWithdrawalDestination('Orange Money — +224 622 12 45 78');
  assertEquals(r, { ok: true, target: { account: '622124578', type_account: 'lp-om-gn' } });
});

Deno.test('00224 tolere aussi', () => {
  const r = parseWithdrawalDestination('MTN — 00224 661 11 22 33');
  assertEquals(r, { ok: true, target: { account: '661112233', type_account: 'lp-momo-gn' } });
});

Deno.test('casse et tirets indifferents', () => {
  const r = parseWithdrawalDestination('orange money - 621-11-22-33');
  assertEquals(r, { ok: true, target: { account: '621112233', type_account: 'lp-om-gn' } });
});

// ── LES REFUS. C'est eux qui protegent l'argent. ──────────────────────────

Deno.test('REFUS : etiquette Orange, numero MTN', () => {
  const r = parseWithdrawalDestination('Orange Money — 664 00 11 22');
  assertEquals(r, { ok: false, reason: 'CARRIER_MISMATCH' });
});

Deno.test('REFUS : etiquette MTN, numero Orange', () => {
  const r = parseWithdrawalDestination('MTN Mobile Money — 622 12 45 78');
  assertEquals(r, { ok: false, reason: 'CARRIER_MISMATCH' });
});

Deno.test('REFUS : prefixe inconnu meme si l etiquette est claire', () => {
  // 65x n'est ni dans la table Orange ni dans MTN : on ne devine pas.
  const r = parseWithdrawalDestination('Orange Money — 655 12 45 78');
  assertEquals(r, { ok: false, reason: 'CARRIER_MISMATCH' });
});

Deno.test('REFUS : aucun operateur nomme', () => {
  const r = parseWithdrawalDestination('622 12 45 78');
  assertEquals(r, { ok: false, reason: 'UNKNOWN_LABEL' });
});

Deno.test('REFUS : les deux operateurs nommes', () => {
  const r = parseWithdrawalDestination('Orange ou MTN — 622 12 45 78');
  assertEquals(r, { ok: false, reason: 'UNKNOWN_LABEL' });
});

Deno.test('REFUS : numero trop court', () => {
  const r = parseWithdrawalDestination('Orange Money — 622 12 45');
  assertEquals(r, { ok: false, reason: 'BAD_FORMAT' });
});

Deno.test('REFUS : numero ne commencant pas par 6', () => {
  const r = parseWithdrawalDestination('Orange Money — 722 12 45 78');
  assertEquals(r, { ok: false, reason: 'BAD_FORMAT' });
});

Deno.test('REFUS : destination vide', () => {
  assertEquals(parseWithdrawalDestination(''), { ok: false, reason: 'NO_DIGITS' });
  assertEquals(parseWithdrawalDestination(null), { ok: false, reason: 'NO_DIGITS' });
});

Deno.test('REFUS : du texte sans aucun chiffre', () => {
  const r = parseWithdrawalDestination('Orange Money');
  assertEquals(r, { ok: false, reason: 'NO_DIGITS' });
});
