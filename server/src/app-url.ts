import 'dotenv/config';

/**
 * The address of the Angular app, used in links inside emails (reset password, invitations).
 * Set APP_URL in .env; otherwise the first address in CLIENT_ORIGIN is used.
 */
export const APP_URL = (
  process.env['APP_URL'] ||
  (process.env['CLIENT_ORIGIN'] || 'http://localhost:4200').split(',')[0]
).trim().replace(/\/$/, '');
