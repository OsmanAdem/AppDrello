import 'dotenv/config';
import nodemailer from 'nodemailer';

/**
 * Sending emails over SMTP, the standard protocol every email provider supports
 * (Gmail, Outlook, Resend, SendGrid, ...). The settings live in .env.
 *
 * If SMTP_HOST is empty, emails are printed in the server's terminal instead,
 * so "Forgot password" can still be tested without an email account.
 */
const host = process.env['SMTP_HOST']?.trim();
const port = Number(process.env['SMTP_PORT'] || 465);

const transporter = host
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // port 465 uses TLS from the start; 587 upgrades with STARTTLS
      auth: { user: process.env['SMTP_USER'], pass: process.env['SMTP_PASS'] }
    })
  : null;

if (transporter) {
  // Check the settings once at startup, so a wrong password shows up right away.
  transporter.verify()
    .then(() => console.log(`Email: sending through ${host}`))
    .catch(error => console.error(`Email: could not connect to ${host}. Check SMTP_* in .env.`, error.message));
} else {
  console.log('Email: SMTP_HOST is not set, so emails are printed here instead of sent.');
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!transporter) {
    console.log(
      '\n──────── Email (development: printed instead of sent) ────────\n' +
      `To:      ${to}\nSubject: ${subject}\n\n${text}\n` +
      '──────────────────────────────────────────────────────────────\n'
    );
    return;
  }

  await transporter.sendMail({
    from: process.env['EMAIL_FROM'] || process.env['SMTP_USER'],
    to,
    subject,
    text
  });
}
