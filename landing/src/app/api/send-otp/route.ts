import { sendEmail } from '@/lib/email';

// Nodemailer uses Node's net/tls/dns — force the Node.js runtime (the Edge runtime lacks them).
export const runtime = 'nodejs';

export async function POST(request: Request) {
  // Only callers holding the shared secret (e.g. Linky's otp-request edge function) may send.
  const provided = request.headers.get('x-otp-secret');
  const expected = process.env.OTP_EMAIL_SECRET;
  if (!expected || provided !== expected) {
    return Response.json({ ok: false, detail: 'unauthorized' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ ok: false, detail: 'invalid_json' }, { status: 400 });
  }
  const { to, code } = (parsed ?? {}) as { to?: unknown; code?: unknown };
  if (typeof to !== 'string' || typeof code !== 'string' || !/^\d{4,8}$/.test(code)) {
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
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, detail }, { status: 502 });
  }
}
