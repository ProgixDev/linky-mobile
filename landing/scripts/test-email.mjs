// Standalone SMTP delivery test — run with: node scripts/test-email.mjs <recipient@example.com>
// Mirrors src/lib/email.ts's transporter config. Plain `node` (not Next) doesn't auto-load
// .env.local, so we parse it here. Kept in sync with email.ts by hand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..'); // scripts/ -> landing root
const envPath = path.join(root, '.env.local');

if (!fs.existsSync(envPath)) {
  console.error(`.env.local not found at ${envPath}`);
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const to = process.argv[2];
if (!to) {
  console.error('usage: node scripts/test-email.mjs <recipient@example.com>');
  process.exit(1);
}

const SMTP_HOST = (process.env.SMTP_HOST ?? '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT ?? '587');
const SMTP_USER = (process.env.SMTP_USER ?? '').trim();
const SMTP_PASS = (process.env.SMTP_PASS ?? '').replace(/\s+/g, '');
const FROM_NAME = process.env.FROM_NAME ?? 'Linky';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

const code = '424242';
try {
  console.log(`verify: ${SMTP_HOST}:${SMTP_PORT} secure=${SMTP_PORT === 465} user=${SMTP_USER} ...`);
  await transporter.verify();
  console.log('verify OK — sending test email to', to);
  const info = await transporter.sendMail({
    from: `${FROM_NAME} <${SMTP_USER}>`,
    to,
    subject: 'Votre code Linky',
    text: `Votre code Linky : ${code}\n\nValide 5 minutes. Ne le partagez avec personne.`,
    html: `<p>Votre code de connexion <strong>Linky</strong> : <b style="font-size:24px;letter-spacing:3px">${code}</b></p><p style="color:#6B7480">Valide 5 minutes. Ne le partagez avec personne.</p>`,
  });
  console.log('SENT OK  messageId=%s  accepted=%o  rejected=%o', info.messageId, info.accepted, info.rejected);
} catch (e) {
  console.error('SEND FAILED:', e?.message ?? e);
  if (e?.code) console.error('  code:', e.code);
  if (e?.command) console.error('  command:', e.command);
  if (e?.response) console.error('  smtp response:', e.response);
  process.exit(1);
}
