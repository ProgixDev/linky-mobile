// LA RELANCE — « ça insiste jusqu'à ce qu'il réponde » (client 2026-09-28).
//
// ┌─ CE QU'ELLE REMPLACE, ET POURQUOI ──────────────────────────────────────┐
// Le client demandait une sonnerie continue avec boutons, façon Uber Eats. Ce
// n'est pas possible sans mentir sur la nature de l'application : depuis le
// 22 janvier 2025 le Play Store révoque à l'installation la permission de
// notification plein écran pour tout ce qui n'est ni une app d'appel ni un
// réveil, et côté Apple le système TUE l'application si un push VoIP n'ouvre
// pas un vrai appel.
//
// Son BUT, lui, est atteignable tel quel : « sinon ils peuvent recevoir une
// commande, réservation ou livraison sans le savoir ». On relance donc, de plus
// en plus espacé, tant que la chose attend son destinataire — et on s'arrête
// net dès qu'il a agi.
// └─────────────────────────────────────────────────────────────────────────┘
//
// Défendue par x-cron-secret, comme cron-poll-intents : la clé anon est
// publique, le routage de la passerelle Supabase ne suffit donc pas.
//
// Le comptage a lieu en base, DANS le sélecteur (pick_pending_nudges réclame ce
// qu'elle rend). Une relance dont le push échoue est donc perdue plutôt que
// rejouée : c'est le bon sens de l'erreur — l'inverse harcèlerait quelqu'un en
// boucle si l'envoi échouait à répétition.
import { serviceClient } from '@shared/db.ts';
import { notify } from '@shared/push.ts';
import type { NotifyApp, NotifyCategory } from '@shared/push.ts';
import type { NotifyKind } from '@shared/notify-kinds.ts';

interface NudgeRow {
  kind: 'order' | 'booking' | 'delivery';
  ref_id: string;
  user_id: string;
  app: 'marketplace' | 'driver';
  label: string;
  /** 1 pour la première relance, 4 pour la dernière. */
  sent_count: number;
  /** La commande rattachée, pour une course. Null ailleurs. */
  extra_id: string | null;
}

/**
 * LE TEXTE MONTE EN INSISTANCE, SANS JAMAIS ACCUSER.
 *
 * Le premier rappel suppose que la notification d'origine s'est perdue — c'est
 * l'hypothèse la plus probable, et de loin, quand le push n'arrive pas. Le
 * dernier dit ce qui va se passer s'il ne fait rien, parce qu'une échéance non
 * dite est une mauvaise surprise : côté commande le remboursement automatique
 * rendra l'argent à l'acheteur, côté réservation la demande expirera.
 */
function copyFor(row: NudgeRow): { title: string; body: string } {
  const n = row.sent_count;
  const last = n >= 4;
  const what = row.label ? `« ${row.label} »` : null;

  if (row.kind === 'order') {
    const ref = row.label ? `La commande ${row.label}` : 'Une commande';
    if (last) {
      return {
        title: 'Dernier rappel — commande à expédier',
        body: `${ref} attend toujours. Sans expédition, elle sera remboursée à l'acheteur et tu ne toucheras rien.`,
      };
    }
    return {
      title: n === 1 ? 'Commande à préparer' : 'Commande toujours en attente',
      body: `${ref} est payée et attend d'être expédiée.`,
    };
  }

  if (row.kind === 'booking') {
    const ref = what ? `pour ${what}` : 'de location';
    if (last) {
      return {
        title: 'Dernier rappel — demande sans réponse',
        body: `La demande ${ref} attend toujours ta réponse. Sans réponse, elle finira par expirer.`,
      };
    }
    return {
      title: n === 1 ? 'Une demande attend ta réponse' : 'Demande toujours sans réponse',
      body: `Accepte ou refuse la demande ${ref}.`,
    };
  }

  const ref = row.label ? `la commande ${row.label}` : 'une commande';
  if (last) {
    return {
      title: 'Dernier rappel — course non prise',
      body: `Tu n'as pas encore récupéré ${ref}. Préviens si tu ne peux pas la faire.`,
    };
  }
  return {
    title: n === 1 ? 'Course à récupérer' : 'Course toujours en attente',
    body: `${ref.charAt(0).toUpperCase()}${ref.slice(1)} t'attend pour le retrait.`,
  };
}

const KIND: Record<NudgeRow['kind'], NotifyKind> = {
  order: 'order',
  booking: 'booking',
  delivery: 'delivery',
};

// La boite in-app range par DOMAINE : une course reste une notification de
// commande pour le livreur, comme le fait deja admin-assign-delivery.
const CATEGORY: Record<NudgeRow['kind'], NotifyCategory> = {
  order: 'order',
  booking: 'booking',
  delivery: 'order',
};

function deeplinkFor(row: NudgeRow): string {
  if (row.kind === 'order') return `/seller/orders/${row.ref_id}`;
  if (row.kind === 'booking') return `/agent/leases/${row.ref_id}`;
  return `/delivery/${row.ref_id}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const expectedSecret = Deno.env.get('LINKY_CRON_SECRET') ?? '';
  const providedSecret = req.headers.get('x-cron-secret') ?? '';
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }

  const sb = serviceClient();
  const { data, error } = await sb.rpc('pick_pending_nudges', { p_limit: 200 });
  if (error) {
    console.error('[cron-nudge-pending] pick error:', error);
    return new Response(JSON.stringify({ error: 'pick failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }

  const rows = (data ?? []) as NudgeRow[];
  const counts = { order: 0, booking: 0, delivery: 0 };
  let failed = 0;

  for (const row of rows) {
    try {
      const { title, body } = copyFor(row);
      await notify(sb, {
        userIds: [row.user_id],
        category: CATEGORY[row.kind],
        kind: KIND[row.kind],
        title,
        body,
        iconHint: row.kind === 'delivery' ? 'bolt' : 'warn',
        deeplink: deeplinkFor(row),
        // Une demande de reservation a un vrai endroit pour trancher
        // (booking-respond) : la relance porte donc les deux boutons. Une
        // commande et une course n'ont aucune etape d'acceptation dans le
        // modele actuel — y mettre les boutons serait mentir.
        decision: row.kind === 'booking',
        refType: row.kind === 'booking' ? 'booking' : 'order',
        refId: row.extra_id ?? row.ref_id,
        app: row.app as NotifyApp,
      });
      counts[row.kind]++;
    } catch (e) {
      // Une relance qui echoue ne doit pas empecher les suivantes : c'est tout
      // l'interet d'une boucle plutot que d'un envoi groupe.
      failed++;
      console.error(`[cron-nudge-pending] ${row.kind} ${row.ref_id} failed:`, e);
    }
  }

  if (rows.length > 0) {
    console.log('[cron-nudge-pending]', JSON.stringify({ ...counts, failed, total: rows.length }));
  }
  return new Response(JSON.stringify({ ok: true, ...counts, failed }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
});
