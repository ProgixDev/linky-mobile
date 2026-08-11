import { sendEmail } from '@/lib/email';
import { timingSafeEqual } from 'node:crypto';

// Generic transactional email — same shared-secret gate + Gmail SMTP relay as
// /api/send-otp, but for content the OTP route's fixed template can't carry
// (currently: the « Télécharger mes données » JSON export, client 2026-08-06).
// Kept as a SEPARATE route rather than widening send-otp's contract, so the
// OTP path's tight code-shape validation stays untouched.
export const runtime = 'nodejs';

function secretOk(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2MB — generous for a JSON data export, bounds abuse

export async function POST(request: Request) {
  // Same shared secret as send-otp — both are "only Linky's edge functions may call this".
  if (!secretOk(request.headers.get('x-otp-secret'), process.env.OTP_EMAIL_SECRET)) {
    return Response.json({ ok: false, detail: 'unauthorized' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ ok: false, detail: 'invalid_json' }, { status: 400 });
  }
  const { to, subject, html, text, attachmentFilename, attachmentContentBase64 } = (parsed ?? {}) as {
    to?: unknown;
    subject?: unknown;
    html?: unknown;
    text?: unknown;
    attachmentFilename?: unknown;
    attachmentContentBase64?: unknown;
  };
  if (typeof to !== 'string' || to.length > 254 || !EMAIL_RE.test(to)) {
    return Response.json({ ok: false, detail: 'invalid_to' }, { status: 400 });
  }
  if (typeof subject !== 'string' || subject.length < 1 || subject.length > 200) {
    return Response.json({ ok: false, detail: 'invalid_subject' }, { status: 400 });
  }
  if (typeof html !== 'string' || html.length < 1 || html.length > 20_000) {
    return Response.json({ ok: false, detail: 'invalid_html' }, { status: 400 });
  }
  let attachments: { filename: string; contentBase64: string }[] | undefined;
  if (attachmentFilename !== undefined || attachmentContentBase64 !== undefined) {
    if (
      typeof attachmentFilename !== 'string' || attachmentFilename.length < 1 || attachmentFilename.length > 120
      || typeof attachmentContentBase64 !== 'string'
      // base64 expands ~4/3 — bound the encoded length, not the decoded one.
      || attachmentContentBase64.length > MAX_ATTACHMENT_BYTES * 4 / 3
    ) {
      return Response.json({ ok: false, detail: 'invalid_attachment' }, { status: 400 });
    }
    attachments = [{ filename: attachmentFilename, contentBase64: attachmentContentBase64 }];
  }

  try {
    await sendEmail({
      to,
      subject,
      text: typeof text === 'string' ? text : '',
      html,
      attachments,
    });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[send-mail] send failed:', e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, detail: 'send_failed' }, { status: 502 });
  }
}
