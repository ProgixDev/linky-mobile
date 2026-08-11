import { sendEmail } from '@/lib/email';
import { timingSafeEqual } from 'node:crypto';

// Nodemailer uses Node's net/tls/dns — force the Node.js runtime (the Edge runtime lacks them).
export const runtime = 'nodejs';

// Constant-time compare of the shared secret — a plain !== leaks OTP_EMAIL_SECRET
// byte-by-byte via response timing. Length check first (timingSafeEqual throws on
// unequal lengths).
function secretOk(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Exactly one well-formed recipient — reject comma/semicolon/whitespace so a
// single string can't fan out to multiple recipients via nodemailer.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export async function POST(request: Request) {
  // Only callers holding the shared secret (e.g. Linky's otp-request edge function) may send.
  if (!secretOk(request.headers.get('x-otp-secret'), process.env.OTP_EMAIL_SECRET)) {
    return Response.json({ ok: false, detail: 'unauthorized' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ ok: false, detail: 'invalid_json' }, { status: 400 });
  }
  const { to, code } = (parsed ?? {}) as { to?: unknown; code?: unknown };
  if (typeof to !== 'string' || to.length > 254 || !EMAIL_RE.test(to) || typeof code !== 'string' || !/^\d{4,8}$/.test(code)) {
    return Response.json({ ok: false, detail: 'invalid_to_or_code' }, { status: 400 });
  }

  try {
    await sendEmail({
      to,
      subject: 'Votre code Linky',
      text: `Votre code Linky : ${code}\n\nValide 5 minutes. Ne le partagez avec personne.`,
      html:
        `<div style="font-family:sans-serif;max-width:420px">` +
        `<p>Votre code de connexion <strong>Linky</strong> :</p>` +
        `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">${code}</p>` +
        `<p style="color:#6B7480;font-size:14px">Valide 5 minutes. Ne le partagez avec personne.</p>` +
        `</div>`,
    });
    return Response.json({ ok: true });
  } catch (e) {
    // Log detail server-side only — never reflect SMTP/infra strings to the caller.
    console.error('[send-otp] send failed:', e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, detail: 'send_failed' }, { status: 502 });
  }
}
