/**
 * Formats a date as YYYY-MM-DD in the user's local time zone.
 * This matches the value an <input type="date"> produces, so keys can be
 * compared directly as strings.
 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
