# Pack: ai-assistant

Streaming LLM chat. The model API key lives in a **Supabase Edge Function** — never in the app —
and message history is **owner-scoped (RLS)**. Logic-first; UI is a placeholder. **Key-free in dev**:
without a key the function streams a canned reply so the whole flow works end to end.

## What you get

- `supabase/functions/ai-chat/index.ts` — the Edge Function (Deno). Verifies the caller's JWT, calls
  the model with the **server-side** key, and streams plain-text deltas back. Falls back to a mock
  stream when `OPENAI_API_KEY` is unset.
- `services/chat-stream.ts` — `streamReply()` async generator using `fetch` from `expo/fetch`
  (streams `response.body` on device).
- `data/assistant-repo.ts` — create/list conversations, get/insert messages (RLS).
- `use-assistant.ts` — loads history, sends a turn, streams the reply into the last message,
  persists both sides.
- `ui/assistant-screen.tsx` — **placeholder** chat screen.
- `supabase/0010_assistant.sql` — `ai_conversations` + `ai_messages`, owner-scoped RLS.

## Install

```
/add-feature ai-assistant
# apply the migration:
supabase db reset
# deploy the function:
supabase functions deploy ai-chat
```

For real answers, set the key as a **server secret** (never `EXPO_PUBLIC_`):

```
supabase secrets set OPENAI_API_KEY=sk-...
```

Use it:

```tsx
<AssistantScreen />                       // new conversation
<AssistantScreen conversationId={id} />   // resume one
```

## Security — why the key is safe

The model key is read **only inside the Edge Function** via `Deno.env`, server-side. The app sends
the user's Supabase JWT; the function authenticates it before doing anything, so an anonymous caller
can't burn your tokens. History is RLS-scoped (a user reads only their own messages). Swap the
provider by changing the function's fetch URL/model — the app doesn't change. To harden further, add
rate-limiting per user inside the function. Mirrors the "secrets server-side only" rule in
`docs/research/01-mobile-security.md`.
