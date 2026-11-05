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
const user = process.env['SMTP_USER']?.trim();
const pass = process.env['SMTP_PASS']?.replace(/\s/g, ''); // Gmail shows App Passwords with spaces
const port = Number(process.env['SMTP_PORT'] || 465);

// Only send real emails when everything is filled in; otherwise print them here.
const transporter = host && user && pass
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // port 465 uses TLS from the start; 587 upgrades with STARTTLS
      auth: { user, pass }
    })
  : null;

if (transporter) {
  // Check the settings once at startup, so a wrong password shows up right away.
  transporter.verify()
    .then(() => console.log(`Email: sending through ${host}`))
    .catch(error => console.error(`Email: could not connect to ${host}. Check SMTP_* in .env.`, error.message));
} else {
  console.log('Email: settings in .env are incomplete (SMTP_HOST, SMTP_USER, SMTP_PASS), so emails are printed here instead of sent.');
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
    from: process.env['EMAIL_FROM'] || user,
    to,
    subject,
    text
  });
}
