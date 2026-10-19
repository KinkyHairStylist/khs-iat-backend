/**
 * A LIKE / ILIKE pattern that matches `text` anywhere, with the user's own
 * `%`, `_` and `\` taken literally — so a search for "%" finds a literal
 * percent sign instead of every row. Postgres's default LIKE escape is `\`.
 */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
