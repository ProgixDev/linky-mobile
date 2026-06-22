// Supabase Edge Function (Deno) — the ONLY place the model API key is read.
// The app calls this with the user's JWT; the key never reaches the client.
// Streams plain-text deltas back so the client stays trivial.
//
// Deploy:  supabase functions deploy ai-chat
// Secret:  supabase secrets set OPENAI_API_KEY=sk-...   (omit for a mock stream)
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Authenticate the caller with their own JWT — RLS still applies to any DB reads.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  // Dev / key-free fallback: stream a canned reply word by word.
  if (!apiKey) {
    const demo =
      "This is a mock assistant reply. Set the OPENAI_API_KEY Supabase secret to get real answers. " +
      "Your message was received and history is being saved with RLS.";
    return streamWords(demo);
  }

  // Real model call. Swap the URL/model/body for any OpenAI-compatible provider.
  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: "You are a concise, helpful assistant." },
        ...messages,
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: "Model request failed" }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Re-emit just the text deltas from OpenAI's SSE as plain text.
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // partial JSON across chunks — ignore; next read completes it.
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
  });
});

function streamWords(text: string): Response {
  const encoder = new TextEncoder();
  const words = text.split(" ");
  const stream = new ReadableStream({
    async start(controller) {
      for (const w of words) {
        controller.enqueue(encoder.encode(w + " "));
        await new Promise((r) => setTimeout(r, 40));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
  });
}
