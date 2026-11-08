import 'dotenv/config';
import nodemailer from 'nodemailer';

/**
 * Sending emails (password reset, invitations). Three ways, picked from .env:
 *
 * 1. BREVO_API_KEY is set  → send through Brevo's web API (HTTPS).
 *    Used online: free hosting such as Render blocks the normal email ports (SMTP),
 *    but ordinary HTTPS requests always work.
 * 2. SMTP_HOST, SMTP_USER and SMTP_PASS are set → send over SMTP (e.g. Gmail on your own computer).
 * 3. Nothing is set → print the email in the server's terminal, so "Forgot password"
 *    can still be tested without an email account.
 */

/** "Drello <osman@example.com>" → { name: 'Drello', email: 'osman@example.com' } */
export function parseSender(value: string): { name?: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/);
  if (match) return match[1] ? { name: match[1].replace(/^"|"$/g, ''), email: match[2] } : { email: match[2] };
  return { email: value.trim() };
}

const brevoKey = process.env['BREVO_API_KEY']?.trim();
const host = process.env['SMTP_HOST']?.trim();
const user = process.env['SMTP_USER']?.trim();
const pass = process.env['SMTP_PASS']?.replace(/\s/g, ''); // Gmail shows App Passwords with spaces
const port = Number(process.env['SMTP_PORT'] || 465);
const from = process.env['EMAIL_FROM']?.trim() || user || '';

const transporter = !brevoKey && host && user && pass
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // port 465 uses TLS from the start; 587 upgrades with STARTTLS
      auth: { user, pass }
    })
  : null;

if (brevoKey) {
  console.log(from
    ? `Email: sending through Brevo as ${from}`
    : 'Email: BREVO_API_KEY is set, but EMAIL_FROM is empty. Set it to your verified Brevo sender.');
} else if (transporter) {
  // Check the settings once at startup, so a wrong password shows up right away.
  transporter.verify()
    .then(() => console.log(`Email: sending through ${host}`))
    .catch(error => console.error(`Email: could not connect to ${host}. Check SMTP_* in .env.`, error.message));
} else {
  console.log('Email: no BREVO_API_KEY or SMTP settings in .env, so emails are printed here instead of sent.');
}

/** Brevo's "send a transactional email" endpoint: https://developers.brevo.com/reference/sendtransacemail */
async function sendWithBrevo(to: string, subject: string, text: string): Promise<void> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': brevoKey!, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: parseSender(from), to: [{ email: to }], subject, textContent: text })
  });
  if (!response.ok) {
    // Brevo explains what's wrong in the answer, e.g. "sender not verified" or "key not valid".
    throw new Error(`Brevo answered ${response.status}: ${await response.text()}`);
  }
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (brevoKey) {
    await sendWithBrevo(to, subject, text);
    return;
  }

  if (!transporter) {
    console.log(
      '\n──────── Email (development: printed instead of sent) ────────\n' +
      `To:      ${to}\nSubject: ${subject}\n\n${text}\n` +
      '──────────────────────────────────────────────────────────────\n'
    );
    return;
  }

  await transporter.sendMail({ from, to, subject, text });
}
