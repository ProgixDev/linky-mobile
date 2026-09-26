import type { Metadata } from 'next';
import { PageShell, LegalSections } from '@/components/landing/PageShell';

// Reecrite le 2026-09-26 pour la revue Google Play.
//
// L'ancienne version disait « Localisation : uniquement si tu l'autorises » et
// s'arretait la. C'etait vrai mais tres insuffisant : Depose diffuse la
// POSITION PRECISE d'un livreur en continu pendant une course, ce que Google
// classe en donnee sensible et dont l'absence dans une politique est l'un des
// motifs de rejet les plus frequents pour une application de livraison. Les
// pieces d'identite du parcours KYC n'etaient pas mentionnees non plus, ni
// aucun sous-traitant par son nom.
//
// Tout ce qui est liste ici a ete releve dans le schema et le code : tables
// users / emails / phones / addresses / kyc_sessions / deliveries (gps_lat,
// livreur_lat) / ledger_entries / otp_codes (ip, user_agent), permissions
// declarees dans app.json, et dependances de paiement et de carte.

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Comment Linky et Dépose collectent, utilisent et protègent tes données personnelles.',
};

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Légal · Confidentialité"
      title="Politique de confidentialité."
      subtitle="Ce que nous faisons (et ne faisons pas) avec tes données personnelles."
    >
      <LegalSections
        updated="26 septembre 2026"
        sections={[
          {
            heading: 'À qui s’applique cette politique',
            body: (
              <p>
                Elle couvre les deux applications de Linky Group :{' '}
                <strong>Linky</strong>, le marché et l’immobilier, et{' '}
                <strong>Dépose</strong>, l’application utilisée par les livreurs.
                Les deux partagent le même compte et la même base de données.
              </p>
            ),
          },
          {
            heading: 'Données que nous collectons',
            body: (
              <>
                <p>Nous collectons les données suivantes :</p>
                <ul>
                  <li>
                    <strong>Compte :</strong> nom affiché, photo de profil,
                    langue, et selon la façon dont tu te connectes, ton{' '}
                    <strong>numéro de téléphone</strong> ou ton{' '}
                    <strong>adresse email</strong>.
                  </li>
                  <li>
                    <strong>Adresses de livraison :</strong> ville, quartier,
                    précisions que tu saisis, et le point que tu poses sur la
                    carte.
                  </li>
                  <li>
                    <strong>Position précise (GPS) :</strong> uniquement avec ton
                    autorisation, et dans deux cas seulement. Sur{' '}
                    <strong>Linky</strong>, pour situer une annonce ou une
                    adresse sur la carte, au moment où tu le demandes. Sur{' '}
                    <strong>Dépose</strong>, la position du livreur est
                    transmise <strong>pendant qu’une course est en cours</strong>,
                    afin que l’acheteur et le vendeur puissent la suivre. Elle
                    cesse d’être transmise dès la fin de la course, et la
                    position d’un acheteur n’est jamais lue pendant un suivi.
                  </li>
                  <li>
                    <strong>Contenu publié :</strong> annonces, photos de tes
                    produits ou de tes biens, commentaires, avis, messages.
                  </li>
                  <li>
                    <strong>Appareil photo et photos :</strong> pour prendre les
                    photos de tes annonces et pour scanner le QR code de remise
                    d’une commande. Nous n’enregistrons jamais de son.
                  </li>
                  <li>
                    <strong>Transactions :</strong> commandes, réservations,
                    montants, mouvements de ton portefeuille Linky. Ces écritures
                    sont comptables : elles ne peuvent pas être effacées.
                  </li>
                  <li>
                    <strong>Pièces d’identité :</strong> si tu passes la
                    vérification d’identité, les documents et le selfie sont
                    traités par notre prestataire de vérification. Nous ne
                    conservons que le résultat (validée, refusée, en attente) et
                    sa date.
                  </li>
                  <li>
                    <strong>Données techniques et de sécurité :</strong> modèle
                    d’appareil, système, et — lors d’une demande de code de
                    connexion — l’adresse IP et le type d’appareil, pour
                    détecter les tentatives abusives.
                  </li>
                  <li>
                    <strong>Paiements :</strong> nous ne voyons ni ne stockons
                    jamais ton numéro de carte ni ton code Mobile Money. Ils sont
                    saisis chez le prestataire de paiement, qui ne nous renvoie
                    que le résultat de la transaction.
                  </li>
                </ul>
              </>
            ),
          },
          {
            heading: 'Pourquoi nous les utilisons',
            body: (
              <p>
                Pour faire fonctionner l’application, sécuriser les transactions
                et l’argent conservé en séquestre, acheminer les livraisons et
                permettre leur suivi, prévenir la fraude, répondre à nos
                obligations comptables et légales, et te contacter au sujet de
                ton compte ou d’une commande. Nous ne prenons aucune décision
                automatisée ayant un effet juridique sur toi.
              </p>
            ),
          },
          {
            heading: 'Avec qui nous les partageons',
            body: (
              <>
                <p>
                  <strong>Nous ne vendons jamais tes données</strong> et nous ne
                  les utilisons pas à des fins publicitaires. Elles sont
                  partagées uniquement avec les prestataires nécessaires au
                  service :
                </p>
                <ul>
                  <li>
                    <strong>Supabase</strong> — hébergement de la base de données
                    et des fichiers, en France (Union européenne).
                  </li>
                  <li>
                    <strong>Lengopay</strong> — encaissement Orange Money, MTN
                    Mobile Money et carte en Guinée.
                  </li>
                  <li>
                    <strong>Stripe</strong> — paiement par carte pour les comptes
                    situés hors de Guinée.
                  </li>
                  <li>
                    <strong>Didit</strong> — vérification d’identité, lorsque tu
                    y as recours.
                  </li>
                  <li>
                    <strong>Mapbox</strong> — affichage des cartes et calcul des
                    itinéraires.
                  </li>
                  <li>
                    <strong>Prelude</strong> et <strong>Twilio</strong> — envoi
                    des codes de connexion par SMS.
                  </li>
                  <li>
                    <strong>Expo</strong> — notifications et mises à jour de
                    l’application.
                  </li>
                </ul>
                <p>
                  Les autres utilisateurs ne voient que ce qui est nécessaire à
                  la transaction : ton nom affiché, ta photo, et — pour une
                  livraison — l’adresse de remise pour le livreur assigné. Ton
                  numéro de téléphone n’est jamais communiqué à un autre
                  utilisateur ; les échanges passent par l’application. Nous
                  transmettons des données aux autorités lorsque la loi l’exige.
                </p>
              </>
            ),
          },
          {
            heading: 'Tes droits',
            body: (
              <p>
                Tu peux à tout moment accéder à tes données, les modifier, ou{' '}
                <strong>supprimer ton compte</strong> depuis{' '}
                <strong>Profil → Confidentialité</strong> — la procédure est
                décrite sur notre page{' '}
                <a href="/legal/suppression-compte">suppression de compte</a>.
                Tu peux aussi retirer à tout moment l’autorisation d’accès à ta
                position dans les réglages de ton téléphone : le suivi de
                livraison cesse alors de fonctionner, le reste de
                l’application continue. Pour obtenir une copie de tes données,
                écris-nous à <strong>privacy@linkygroup.com</strong>.
              </p>
            ),
          },
          {
            heading: 'Conservation',
            body: (
              <p>
                Nous gardons tes données tant que ton compte est actif. Après
                suppression, ton profil et tes annonces disparaissent ; les
                écritures comptables liées à tes commandes et à ton portefeuille
                sont conservées jusqu’à <strong>3 ans</strong> pour répondre à
                nos obligations légales. Les positions GPS d’une livraison ne
                sont conservées que le temps de la course et de son éventuel
                litige. Les codes de connexion expirent en quelques minutes.
              </p>
            ),
          },
          {
            heading: 'Sécurité',
            body: (
              <p>
                Tes données sont chiffrées en transit (TLS) et au repos. Les mots
                de passe ne sont jamais stockés en clair. L’accès à la base est
                réservé à nos services : aucune application ne l’interroge
                directement. En cas de violation de données susceptible de te
                porter atteinte, nous t’en informons.
              </p>
            ),
          },
          {
            heading: 'Identifiants techniques',
            body: (
              <p>
                L’application conserve sur ton appareil ce qu’il faut pour te
                garder connecté et retenir tes préférences. Nous n’utilisons
                aucun identifiant publicitaire et nous ne suivons pas ton
                activité en dehors de Linky.
              </p>
            ),
          },
          {
            heading: 'Mineurs',
            body: (
              <p>
                Linky est réservée aux personnes de 18 ans et plus. Si tu
                découvres qu’un compte appartient à un mineur, signale-le à{' '}
                <strong>privacy@linkygroup.com</strong>.
              </p>
            ),
          },
          {
            heading: 'Contact',
            body: (
              <p>
                Responsable du traitement : <strong>Linky Group</strong>,
                Conakry, Guinée. Toute question sur tes données :{' '}
                <strong>privacy@linkygroup.com</strong>.
              </p>
            ),
          },
        ]}
      />
    </PageShell>
  );
}
