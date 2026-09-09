import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatGNF } from './format';
import { formatBookingDate } from '../components/booking/BookingUI';
import type { Booking } from '../data/types';

/**
 * Le contrat de location, en PDF.
 *
 * DEMANDE DU CLIENT, 2026-09-09 : « pour contrat il faut que le client puisse
 * telecharger le contrat apres un loyer effectue avec succes ».
 *
 * POURQUOI UN PDF ET PAS UN PARTAGE DE TEXTE. Ce document est la seule preuve
 * qu'un locataire garde de son bail : montants, dates, noms des deux parties,
 * clauses, et les deux signatures horodatees. Un texte colle dans WhatsApp
 * perd la mise en forme, se tronque, et ne s'archive pas. expo-print rend un
 * vrai fichier que le telephone enregistre, imprime ou envoie.
 *
 * TOUT EST DEJA SUR L'APPAREIL. `booking.contract` est l'instantane fige a la
 * demande — c'est LUI qui fait foi, pas les valeurs actuelles du bien, qui ont
 * pu changer depuis. Aucune requete n'est necessaire, et le PDF reste donc
 * generable sans reseau.
 *
 * LE HTML EST AUTONOME : polices systeme, aucune image, aucun style externe.
 * Une feuille distante qui ne charge pas donnerait un document nu, et sur un
 * forfait guineen elle ne chargerait pas toujours.
 */

/** Le contrat est-il un document complet, signe par les deux parties ? */
export function contractIsSigned(b: Booking): boolean {
  return !!b.contract && !!b.landlordSignedAt && !!b.tenantSignedAt;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(k: string, v: string): string {
  return `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`;
}

function signedOn(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function contractHtml(b: Booking): string {
  const c = b.contract!;
  const isSale = c.period === 'sale';
  const title = isSale ? "Contrat d'achat" : 'Contrat de location';

  const periodRow = isSale
    ? ''
    : c.period === 'day'
      ? row('Période', `Du ${formatBookingDate(c.start_date)} au ${formatBookingDate(c.end_date ?? c.start_date)}`)
      : row('Période', `${c.months ?? 1} mois à partir du ${formatBookingDate(c.start_date)}`);

  const moneyRows = isSale
    ? row('Prix du bien', formatGNF(c.amount_minor))
    : [
        row(c.period === 'day' ? 'Loyer / jour' : 'Loyer / mois', formatGNF(c.rent_minor)),
        c.period === 'day'
          ? row('Montant du séjour', formatGNF(c.amount_minor))
          : c.deposit_minor
            ? row('Caution (1 mois)', formatGNF(c.deposit_minor))
            : '',
      ].join('');

  // La commission garde sa ligne, comme a l'ecran : le proprietaire lit ce
  // document lui aussi et doit y voir ce que la plateforme preleve.
  const clauses = c.clauses.map((cl) => `<li>${esc(cl)}</li>`).join('');

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<style>
  @page { margin: 18mm 16mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1E2825; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 17pt; margin: 0 0 2mm; color: #0A5240; letter-spacing: -0.3px; }
  .ref { font-size: 9pt; color: #6B7480; margin-bottom: 7mm; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  td { padding: 2.2mm 0; border-bottom: 1px solid #E4E8EC; vertical-align: top; }
  td.k { color: #6B7480; font-size: 10pt; width: 45%; }
  td.v { text-align: right; font-weight: 600; }
  tr.total td { border-bottom: none; border-top: 2px solid #0A5240; padding-top: 3mm; font-size: 12.5pt; }
  h2 { font-size: 11pt; margin: 6mm 0 2mm; color: #0A5240; }
  ol { padding-left: 5mm; margin: 0; }
  li { margin-bottom: 1.6mm; font-size: 10pt; color: #38424A; }
  .sig { display: flex; gap: 6mm; margin-top: 8mm; }
  .sig div { flex: 1; border: 1px solid #E4E8EC; border-radius: 3mm; padding: 3mm; }
  .sig .who { font-size: 9pt; color: #6B7480; }
  .sig .when { font-size: 10pt; font-weight: 600; margin-top: 1mm; }
  footer { margin-top: 9mm; border-top: 1px solid #E4E8EC; padding-top: 3mm; text-align: center; font-size: 8.5pt; color: #6B7480; }
</style></head><body>
  <h1>${esc(title)}</h1>
  <div class="ref">Référence ${esc(b.id)}</div>

  <table>
    ${row(isSale ? 'Vendeur' : 'Propriétaire', c.landlord_name)}
    ${row(isSale ? 'Acheteur' : 'Locataire', c.tenant_name)}
    ${row('Bien', c.property_title)}
    ${row('Adresse', c.property_location)}
    ${periodRow}
  </table>

  <table>
    ${moneyRows}
    ${row('Frais de service', formatGNF(c.fees_minor))}
    <tr class="total"><td class="k">Total payé</td><td class="v">${esc(formatGNF(c.total_minor))}</td></tr>
  </table>

  <h2>Clauses</h2>
  <ol>${clauses}</ol>

  <div class="sig">
    <div>
      <div class="who">${esc(isSale ? 'Vendeur' : 'Propriétaire')} — ${esc(c.landlord_name)}</div>
      <div class="when">Signé le ${esc(signedOn(b.landlordSignedAt))}</div>
    </div>
    <div>
      <div class="who">${esc(isSale ? 'Acheteur' : 'Locataire')} — ${esc(c.tenant_name)}</div>
      <div class="when">Signé le ${esc(signedOn(b.tenantSignedAt))}</div>
    </div>
  </div>

  <footer>
    Document généré par Linky — Marketplace &amp; Immobilier de Guinée.<br>
    Les deux parties ont validé ce contrat dans l'application ; le paiement vaut signature du locataire.
  </footer>
</body></html>`;
}

/**
 * Produit le PDF et ouvre le partage du systeme.
 *
 * Rend un message d'erreur a afficher, ou null si tout s'est bien passe. Ne
 * leve jamais : un contrat qu'on n'arrive pas a exporter ne doit pas casser
 * l'ecran de la reservation.
 */
export async function shareContractPdf(b: Booking): Promise<string | null> {
  if (!b.contract) return "Ce contrat n'est pas encore disponible.";
  try {
    const { uri } = await Print.printToFileAsync({ html: contractHtml(b) });
    // Certaines configurations n'ont aucune cible de partage (emulateur nu).
    if (!(await Sharing.isAvailableAsync())) {
      return 'Le partage n’est pas disponible sur cet appareil.';
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Contrat Linky',
      UTI: 'com.adobe.pdf',
    });
    return null;
  } catch {
    return 'Impossible de générer le contrat.';
  }
}
