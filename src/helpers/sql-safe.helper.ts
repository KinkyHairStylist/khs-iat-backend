import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

const SAFE_ALIAS_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const SQL_RESERVED_WORDS = new Set([
  'select', 'from', 'where', 'table', 'order', 'group',
  'by', 'join', 'inner', 'outer', 'left', 'right', 'on',
  'insert', 'update', 'delete', 'drop', 'create', 'alter',
  'index', 'into', 'values', 'set', 'having', 'limit',
  'offset', 'union', 'all', 'distinct', 'as', 'case',
  'when', 'then', 'else', 'end', 'null', 'true', 'false',
]);

export class SqlSafeHelper {
  /**
   * Enforces that alias is a valid SQL identifier at runtime.
   * Throws before the alias is ever written into a query string.
   */
  private static validateAlias(alias: string): void {
    if (!SAFE_ALIAS_PATTERN.test(alias)) {
      throw new Error(
        'SQL alias failed validation: must start with a letter or underscore ' +
        'and contain only letters, digits, and underscores.',
      );
    }

    if (SQL_RESERVED_WORDS.has(alias.toLowerCase())) {
      throw new Error(
        'SQL alias failed validation: value is a reserved SQL keyword ' +
        'and cannot be used as a query alias.',
      );
    }
  }

  /**
   * Adds a Haversine distance SELECT to the query using named parameters.
   * Use this when you need the distance column for ordering only.
   */
  static haversineSelect<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    lat: number,
    lng: number,
  ): SelectQueryBuilder<T> {
    SqlSafeHelper.validateAlias(alias);

    return qb
      .addSelect(
        `ROUND((6371 * ACOS(
          COS(RADIANS(:__lat)) * COS(RADIANS(${alias}.latitude)) *
          COS(RADIANS(${alias}.longitude) - RADIANS(:__lng)) +
          SIN(RADIANS(:__lat)) * SIN(RADIANS(${alias}.latitude))
        ))::numeric, 2)`,
        'distance',
      )
      .setParameter('__lat', lat)
      .setParameter('__lng', lng);
  }

  /**
   * Adds a Haversine distance SELECT + a WHERE clause that filters rows
   * within radiusKm. Fixes the HAVING-without-GROUP-BY pattern which only
   * works as a set-level filter, not a row-level filter.
   */
  static haversineWhere<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    lat: number,
    lng: number,
    radiusKm: number,
  ): SelectQueryBuilder<T> {
    SqlSafeHelper.validateAlias(alias);

    const expr = `6371 * ACOS(
      COS(RADIANS(:__lat)) * COS(RADIANS(${alias}.latitude)) *
      COS(RADIANS(${alias}.longitude) - RADIANS(:__lng)) +
      SIN(RADIANS(:__lat)) * SIN(RADIANS(${alias}.latitude))
    )`;

    return qb
      .addSelect(`ROUND((${expr})::numeric, 2)`, 'distance')
      .andWhere(`(${expr}) <= :__radius`)
      .setParameter('__lat', lat)
      .setParameter('__lng', lng)
      .setParameter('__radius', radiusKm);
  }

  /**
   * Validates that sortBy is in the explicit allowlist before using it as a
   * column name. Falls back to defaultColumn if absent or not in the list.
   */
  static validateSortColumn(
    sortBy: string | undefined,
    allowedColumns: readonly string[],
    defaultColumn: string,
  ): string {
    if (!sortBy || !allowedColumns.includes(sortBy)) {
      return defaultColumn;
    }
    return sortBy;
  }
}
