import nodemailer from 'nodemailer';

// One transporter, created at module load and reused across requests.
// Next.js loads .env.local automatically, so process.env is populated server-side.
const SMTP_HOST = (process.env.SMTP_HOST ?? '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT ?? '587');
const SMTP_USER = (process.env.SMTP_USER ?? '').trim();
const SMTP_PASS = (process.env.SMTP_PASS ?? '').replace(/\s+/g, ''); // Gmail app pw is shown with spaces
const FROM_NAME = process.env.FROM_NAME ?? 'Linky';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // 465 = implicit TLS; 587 = STARTTLS (secure:false, upgrades automatically)
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
  try {
    await transporter.sendMail({
      from: `${FROM_NAME} <${SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`email send failed: ${msg}`);
  }
}

// Opens an SMTP connection and authenticates without sending — handy for health checks / the test script.
export async function verifyEmail(): Promise<void> {
  await transporter.verify();
}
