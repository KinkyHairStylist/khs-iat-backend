/**
 * DEV-057: sortBy allowlist unit tests.
 *
 * Tests the allowlist logic in isolation — no DB, no NestJS context.
 * Mirrors the exact logic in client.service.ts getClients().
 */

const ALLOWED_SORT_COLUMNS = new Set([
  'createdAt',
  'firstName',
  'lastName',
  'email',
  'phone',
  'updatedAt',
]);

function resolveSortColumn(sortBy: string | undefined): string {
  const safe = sortBy && ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'createdAt';
  return `client.${safe}`;
}

describe('DEV-057 — sortBy allowlist', () => {
  describe('valid sortBy values', () => {
    const allowed = ['createdAt', 'firstName', 'lastName', 'email', 'phone', 'updatedAt'];

    allowed.forEach((col) => {
      it(`accepts "${col}" → client.${col}`, () => {
        expect(resolveSortColumn(col)).toBe(`client.${col}`);
      });
    });
  });

  describe('invalid / malicious sortBy values', () => {
    const cases: Array<[string, string | undefined]> = [
      ['SQL injection payload', "id; DROP TABLE clients--"],
      ['DELETE injection', "'; DELETE FROM clients WHERE '1'='1"],
      ['path traversal attempt', '../../../etc/passwd'],
      ['unknown column', 'unknownColumn'],
      ['empty string', ''],
      ['undefined', undefined],
    ];

    cases.forEach(([label, payload]) => {
      it(`rejects ${label} → falls back to client.createdAt`, () => {
        expect(resolveSortColumn(payload)).toBe('client.createdAt');
      });
    });
  });
});
