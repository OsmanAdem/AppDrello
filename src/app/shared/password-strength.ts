/**
 * How strong is a password? Used while typing (the meter) and before sending.
 * The server has an identical copy in server/src/password-strength.ts, so both always agree.
 *
 * Follows modern advice (NIST SP 800-63B): length matters most, there are no forced
 * "one capital, one number" rules, and common or easy-to-guess passwords are refused.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 64;

/** 0 = Weak (not allowed), 1 = Fair, 2 = Good, 3 = Strong. */
export type PasswordScore = 0 | 1 | 2 | 3;

export interface PasswordCheck {
  score: PasswordScore;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  /** Why the password can't be used, or null when it's allowed. */
  problem: string | null;
  /** A short hint shown under the meter. */
  tip: string;
}

/** Some of the most used passwords (lowercase). Variants like "Password1!" are caught too. */
const COMMON = new Set([
  'password', 'passwort', 'passord', 'losenord', 'lösenord', 'motdepasse', 'contrasena', 'qwerty', 'qwertz',
  'azerty', 'letmein', 'welcome', 'admin', 'administrator', 'root', 'login', 'guest', 'test', 'testing',
  'default', 'changeme', 'secret', 'iloveyou', 'loveyou', 'love', 'lovely', 'monkey', 'dragon', 'master',
  'shadow', 'sunshine', 'princess', 'superman', 'batman', 'spiderman', 'starwars', 'pokemon', 'naruto',
  'minecraft', 'fortnite', 'football', 'baseball', 'basketball', 'soccer', 'hockey', 'liverpool',
  'chelsea', 'arsenal', 'barcelona', 'realmadrid', 'juventus', 'freedom', 'whatever', 'trustno', 'hello',
  'hejsan', 'hejhej', 'charlie', 'michael', 'jennifer', 'jordan', 'hunter', 'ranger', 'buster', 'killer',
  'george', 'andrew', 'thomas', 'robert', 'daniel', 'jessica', 'ashley', 'pepper', 'ginger', 'tigger',
  'maggie', 'bailey', 'snoopy', 'mickey', 'summer', 'winter', 'spring', 'autumn', 'computer', 'internet',
  'google', 'facebook', 'instagram', 'apple', 'samsung', 'microsoft', 'mustang', 'cheese', 'flower',
  'orange', 'banana', 'chocolate', 'cookie', 'matrix', 'angel', 'family', 'friends', 'forever', 'money',
  'purple', 'yellow', 'silver', 'golden', 'diamond', 'sweden', 'sverige', 'stockholm', 'drello', 'trello',
  'abc', 'abcd', 'qwe', 'asd', 'zxc', 'qazwsx', 'zaqwsx', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'asdfgh',
  'abcabc', 'aaa', 'pass', 'passw', 'access', 'mypass', 'mypassword', 'newpassword', 'userpassword',
  'football1', 'baseball1', 'iloveu', 'blink', 'zaq', 'qazxsw', 'qwertyui', 'asdasd'
]);

/** Keyboard rows and alphabets, to spot "qwertyui", "12345678", "abcdefgh" and their reverse. */
const SEQUENCES = ['qwertyuiopasdfghjklzxcvbnm', 'abcdefghijklmnopqrstuvwxyz', '01234567890', 'qazwsxedcrfvtgbyhnujmikolp'];

/** "P@ssw0rd!" → "password": undo the usual letter swaps. */
function deLeet(value: string): string {
  return value
    .replace(/[@4]/g, 'a').replace(/[0]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e')
    .replace(/[$5]/g, 's').replace(/7/g, 't').replace(/[^a-zåäö]/g, '');
}

function isCommon(lower: string): boolean {
  const lettersOnly = lower.replace(/[^a-zåäö]/g, '');
  const withoutEnding = lower.replace(/[\d\W_]+$/, ''); // "summer2024!" → "summer"
  return [lower, lettersOnly, withoutEnding, deLeet(lower)].some(value => value.length > 0 && COMMON.has(value));
}

function isSequence(lower: string): boolean {
  if (lower.length < 4) return false;
  return SEQUENCES.some(row => row.includes(lower) || [...row].reverse().join('').includes(lower));
}

function looksPersonal(lower: string, personal: string[]): boolean {
  return personal
    .flatMap(value => (value ?? '').toLowerCase().split(/[\s@._+-]+/))
    .filter(part => part.length >= 3)
    .some(part => lower.includes(part));
}

export function checkPassword(password: string, personal: string[] = []): PasswordCheck {
  const weak = (problem: string): PasswordCheck => ({ score: 0, label: 'Weak', problem, tip: problem });
  const lower = password.toLowerCase();

  if (password.length < MIN_PASSWORD_LENGTH) {
    return weak(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return weak(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (new Set(lower).size <= 3) {
    return weak('Use more different characters, not the same few repeated.');
  }
  if (isSequence(lower) || isSequence(lower.replace(/[^a-z0-9]/g, ''))) {
    return weak('Avoid simple sequences, like numbers or keyboard letters in a row.');
  }
  if (isCommon(lower)) {
    return weak('This is a very common password. Pick something harder to guess.');
  }
  if (looksPersonal(lower, personal)) {
    return weak("Don't use your name or email address in your password.");
  }

  // Allowed. Longer passwords and passphrases of several words score higher.
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(kind => kind.test(password)).length;
  const words = password.split(/[\s\-_.,]+/).filter(word => word.length >= 3).length;
  const length = password.length;
  if ((length >= 12 && kinds >= 3) || length >= 16 || (words >= 3 && length >= 14)) {
    return { score: 3, label: 'Strong', problem: null, tip: 'Strong password.' };
  }
  if (length >= 10 || kinds >= 3 || words >= 2) {
    return { score: 2, label: 'Good', problem: null, tip: 'Good. A few more characters make it strong.' };
  }
  return { score: 1, label: 'Fair', problem: null, tip: 'Fair. Make it longer, or use a few words, to make it stronger.' };
}
