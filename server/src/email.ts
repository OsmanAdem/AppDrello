/**
 * Sending emails.
 *
 * Real email needs an email service (for example Resend, SendGrid, or SMTP via nodemailer)
 * with an account and an API key in .env. Until one is set up, this prints the email in the
 * server's terminal instead, so the "forgot password" flow can be tested locally.
 *
 * To send real emails later, replace the body of sendEmail() with a call to your provider.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  console.log(
    '\n──────── Email (development: printed instead of sent) ────────\n' +
    `To:      ${to}\nSubject: ${subject}\n\n${text}\n` +
    '──────────────────────────────────────────────────────────────\n'
  );
}
