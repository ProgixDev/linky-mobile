// AI product-description generator — writes a short French marketing description from
// the product's title / category / condition / keywords via the Groq API (OpenAI-
// compatible chat completions, fast Llama inference). Authed (requireUser).
// Rate-limited (8/min, 60/day per user). Gated on GROQ_API_KEY: returns AI_UNAVAILABLE
// until the key is configured as a Supabase secret. Deno → raw HTTPS (no SDK).
//
// Was Gemini until 2026-08-31 — swapped on request, same rate limits and prompt,
// only the HTTP call and response shape changed.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  title: string;
  category?: string;
  condition?: string;
  keywords?: string;
}

// Swap here if Groq deprecates the model. llama-3.3-70b-versatile is the
// current general-purpose default (fast, no reasoning/JSON-mode needed here).
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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

    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) {
      throwApi('AI_UNAVAILABLE', 503, "La génération par IA n'est pas encore activée.");
    }

    // Rate limit — keep usage inside the free quota. 8/min, 60/day per user.
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

    // Reserve the slot BEFORE the Groq call (count attempts, not just
    // successes). Inserting after the call let N concurrent requests all pass
    // the pre-write count and all hit Groq — cost amplification against the
    // owner's key. Reserving here shrinks the race window from the whole call
    // (~seconds) to a couple of DB round-trips.
    await sb.from('ai_generation_log').insert({ user_id: userId });

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
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('[generate-description] groq error:', res.status, detail);
        throwApi('AI_FAILED', 502, 'Génération impossible pour le moment. Réessaie.');
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = (json.choices?.[0]?.message?.content ?? '').trim();
      if (!text) throwApi('AI_FAILED', 502, 'La génération est revenue vide. Réessaie.');
      // (Slot already reserved before the call — see the insert above.)
      return { body: { description: text } };
    } catch (e) {
      console.error('[generate-description] threw:', e);
      throwApi('AI_FAILED', 502, 'Génération impossible pour le moment. Réessaie.');
    }
  }),
);
