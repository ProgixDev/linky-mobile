# Pack: chat-realtime

WhatsApp-style messaging — **1:1 and group** — over **Supabase Realtime**. Backend + logic +
realtime are 100% wired; UI is a placeholder. **No extra keys or services** (uses the skeleton's
Supabase + the free Realtime tier).

## What you get

- **Migration** (`supabase/0010_chat.sql`): `conversations`, `conversation_members`, `messages` with
  **RLS-first** policies — members-only read, send-as-yourself, owner-scoped. Membership is checked
  via a `SECURITY DEFINER` helper to avoid recursive RLS. `messages` is added to the Realtime
  publication (RLS still scopes what each client receives).
- `data/chat-repo.ts` — `listConversations`, `getMessages`, `sendMessage`, `createDirectConversation`,
  `markRead`. All Zod-validated, all RLS-enforced.
- `realtime.ts` — `subscribeToMessages(conversationId, onInsert)` → live new-message stream + unsubscribe.
- `useConversation(id)` → `{ messages, loading, error, send }` (history + realtime + optimistic send).
- `MessageThread` — a **placeholder** thread screen proving it end to end.

## Install

```
/add-feature chat-realtime
# copy supabase/0010_chat.sql into supabase/migrations/ (next free number), then:
supabase db reset && supabase test db
```

Requires the **auth** from Phase 2 (chat is per signed-in user). Then:

```ts
const id = (await createDirectConversation(otherUserId)).value;  // start a DM
<MessageThread conversationId={id} />                            // render the thread
```

## Security

RLS is the boundary: a user can only read conversations/messages they're a member of, and can only
send as themselves. Realtime respects RLS. Never trust the client — the policies enforce everything
(see `docs/architecture/backend.md`). Add typing-indicators/presence later with Realtime Broadcast.

## Extending

- **Groups**: insert multiple members (creator can add others per the `members: insert` policy);
  set `is_group = true` + a `title`.
- **Read receipts / unread badges**: `markRead` updates `last_read_at`; compare to latest message.
- **Attachments**: add a Supabase Storage bucket (private, per-user folder) + a `media_url` column.
