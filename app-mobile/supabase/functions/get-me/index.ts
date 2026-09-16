// Le profil de l'utilisateur connecte, tel qu'il est en base MAINTENANT.
//
// POURQUOI CETTE FONCTION N'EXISTAIT PAS, ET POURQUOI ELLE MANQUAIT. L'application
// recoit le profil a la connexion (otp-verify, email-signin, phone-signin) ou en
// reponse a update-profile, puis le garde en cache. Rien ne le rafraichissait
// ensuite. Toute modification faite hors de l'application — un role accorde par
// l'administration, une region de paiement corrigee par l'equipe — restait donc
// invisible jusqu'a la prochaine connexion. Le 2026-09-16, deux comptes du client
// ont ete declares « a l'etranger » en base ; il a fallu lui demander de se
// deconnecter puis de se reconnecter pour que la carte change.
//
// LE DECLENCHEUR, le 2026-09-17 : les comptes crees AVANT l'enregistrement de la
// region a l'inscription n'ont aucune region. L'application leur pose desormais
// la question « Vous etes ou ? » une seule fois. Mais elle ne doit la poser QUE
// si le serveur confirme l'absence de region — sans quoi un compte deja corrige
// par l'equipe se la verrait reposer sur la foi d'un cache perime.
//
// MEME FORME QUE update-profile, au champ pres : une divergence de forme entre
// deux reponses de profil a deja fait perdre un reglage a la reconnexion (voir
// email-signup).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

// Corps vide — POST + cle d'idempotence, comme le reste de l'API Linky.
type Body = Record<string, unknown>;
function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/me', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);
  const { data: user, error } = await sb
    .from('users')
    .select('id, display_name, avatar_url, locale, kyc_status, city, roles, is_admin, profile_public, personalize_feed, payment_abroad_override, payment_profile')
    .eq('id', userId)
    .single();
  if (error || !user) {
    console.error('[get-me] select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture profil');
  }
  return { body: { user } };
}));
