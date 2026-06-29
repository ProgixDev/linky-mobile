// AI product-description generator — writes a short French marketing description from
// the product's title / category / condition / keywords via the Anthropic Messages API.
// Authed (requireUser). Gated on ANTHROPIC_API_KEY: returns AI_UNAVAILABLE until the
// key is configured as a Supabase secret. Deno → raw HTTPS to the Anthropic API (no SDK).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  title: string;
  category?: string;
  condition?: string;
  keywords?: string;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.title !== 'string' || x.title.trim().length < 2 || x.title.length > 120) return false;
  for (const k of ['category', 'condition', 'keywords'] as const) {
    if (x[k] !== undefined && (typeof x[k] !== 'string' || (x[k] as string).length > 200)) {
      return false;
    }
  }
  return true;
}

Deno.serve(
  makePost<Body>('/v1/ai/generate-description', valid, async ({ req, body, sb }) => {
    const userId = await requireUser(req);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throwApi('AI_UNAVAILABLE', 503, "La génération par IA n'est pas encore activée.");
    }

    // Rate limit — every call is a paid Anthropic request. 8/min, 60/day per user.
    const now = Date.now();
    const { count: perMin } = await sb
      .from('ai_generation_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', new Date(now - 60_000).toISOString());
    if ((perMin ?? 0) >= 8) {
      throwApi('AI_RATE_LIMITED', 429, 'Trop de générations. Réessaie dans un instant.');
    }
    const { count: perDay } = await sb
      .from('ai_generation_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', new Date(now - 86_400_000).toISOString());
    if ((perDay ?? 0) >= 60) {
      throwApi('AI_RATE_LIMITED', 429, 'Limite quotidienne de générations atteinte.');
    }

    const facts = [
      `Titre : ${body.title.trim()}`,
      body.category ? `Catégorie : ${body.category.trim()}` : '',
      body.condition ? `État : ${body.condition.trim()}` : '',
      body.keywords ? `Mots-clés : ${body.keywords.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const prompt =
      'Tu es vendeur sur Linky, une marketplace en Guinée. Rédige une description de produit ' +
      'en FRANÇAIS — claire, honnête et engageante — pour l’annonce ci-dessous. 2 à 4 phrases ' +
      'courtes, ton calme et direct. Pas de prix, pas d’émojis, aucune promesse exagérée. ' +
      'Réponds UNIQUEMENT avec la description, sans préambule ni commentaire.\n\n' +
      `${facts}\n\nDescription :`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('[generate-description] anthropic error:', res.status, detail);
        throwApi('AI_FAILED', 502, 'Génération impossible pour le moment. Réessaie.');
      }
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = (json.content ?? [])
        .filter((blk) => blk.type === 'text')
        .map((blk) => blk.text ?? '')
        .join('')
        .trim();
      if (!text) throwApi('AI_FAILED', 502, 'La génération est revenue vide. Réessaie.');
      await sb.from('ai_generation_log').insert({ user_id: userId });
      return { body: { description: text } };
    } catch (e) {
      console.error('[generate-description] threw:', e);
      throwApi('AI_FAILED', 502, 'Génération impossible pour le moment. Réessaie.');
    }
  }),
);
