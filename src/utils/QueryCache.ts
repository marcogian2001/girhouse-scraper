import { Redis } from '@upstash/redis';
import { getTableName, is, Table } from 'drizzle-orm';
import type { MutationOption } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import { UpstashCache } from 'drizzle-orm/cache/upstash';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import * as schema from '@/models/Schema';

// Writes clear what they touch at once; this only bounds an entry cached during a write, or after a manual edit
const CACHE_TTL_SECONDS = 10 * 60;

// Delete actions that change the referencing rows too
const CHANGING_DELETE_ACTIONS = new Set(['cascade', 'set null', 'set default']);

/**
 * Maps each table to every table that references it through foreign keys, directly or not.
 * @param options The schema.
 * @param options.tables The tables of the schema.
 * @param options.deletesOnly Keeps only the references a delete changes, through cascades and nulls.
 * @returns The referencing table names, by referenced table name.
 */
export const buildDependentTables = (options: { tables: PgTable[]; deletesOnly: boolean }) => {
  const children = new Map<string, Set<string>>();

  for (const table of options.tables) {
    for (const foreignKey of getTableConfig(table).foreignKeys) {
      const changedByDelete =
        foreignKey.onDelete !== undefined && CHANGING_DELETE_ACTIONS.has(foreignKey.onDelete);

      if (!options.deletesOnly || changedByDelete) {
        const parent = getTableName(foreignKey.reference().foreignTable);
        children.set(parent, (children.get(parent) ?? new Set()).add(getTableName(table)));
      }
    }
  }

  const reach = (table: string, reached: Set<string>) => {
    for (const child of children.get(table) ?? []) {
      if (!reached.has(child)) {
        reached.add(child);
        reach(child, reached);
      }
    }

    return reached;
  };

  return new Map([...children.keys()].map((table) => [table, [...reach(table, new Set())]]));
};

/**
 * Adds the dependent tables of each table to the list.
 * @param tables The table names.
 * @param dependents The dependent tables, by table name.
 * @returns The table names and their dependents, once each.
 */
const withDependents = (tables: string[], dependents: Map<string, string[]>) => [
  ...new Set(tables.flatMap((table) => [table, ...(dependents.get(table) ?? [])])),
];

/**
 * Logs a Redis call that failed, which the query then skips.
 * @param options The failure.
 * @param options.action What the cache was doing.
 * @param options.error What Redis threw.
 */
const warnCacheFailure = (options: { action: string; error: unknown }) => {
  logger.warn('The query cache could not {action}: {error}', {
    action: options.action,
    error: options.error instanceof Error ? options.error.message : String(options.error),
  });
};

/**
 * Upstash cache that sees the tables Drizzle misses. Drizzle tracks only the tables a
 * query selects from or joins, so a cached query also depends on the tables that
 * reference them, which its `sql` subqueries read. A write also clears the tables its
 * deletes cascade to, which Postgres changes without Drizzle seeing it.
 */
class SchemaAwareUpstashCache extends UpstashCache {
  private readonly readDependents: Map<string, string[]>;
  private readonly deleteDependents: Map<string, string[]>;

  constructor(redis: Redis, tables: PgTable[]) {
    // Only queries marked with `$withCache()` are cached; every write still clears its tables
    super(redis, { ex: CACHE_TTL_SECONDS }, false);
    this.readDependents = buildDependentTables({ tables, deletesOnly: false });
    this.deleteDependents = buildDependentTables({ tables, deletesOnly: true });
  }

  // A failing Redis must not break pages or writes, so each call falls back to the database

  override async get(key: string, tables: string[], isTag?: boolean, isAutoInvalidate?: boolean) {
    const read = withDependents(tables, this.readDependents);

    return await super
      .get(key, read, isTag, isAutoInvalidate)
      .catch((error: unknown): undefined => {
        warnCacheFailure({ action: 'read', error });
      });
  }

  override async put(
    key: string,
    response: unknown,
    tables: string[],
    isTag?: boolean,
    config?: CacheConfig,
  ) {
    // Empty tables mark a query that is never cleared by writes, so they stay empty
    const read = tables.length > 0 ? withDependents(tables, this.readDependents) : tables;

    await super.put(key, response, read, isTag, config).catch((error: unknown) => {
      warnCacheFailure({ action: 'store', error });
    });
  }

  override async onMutate(params: MutationOption) {
    const given = params.tables ?? [];
    const written: (Table | string)[] = Array.isArray(given) ? given : [given];
    const tables = written.map((table) => (is(table, Table) ? getTableName(table) : table));

    await super
      .onMutate({ tags: params.tags, tables: withDependents(tables, this.deleteDependents) })
      .catch((error: unknown) => {
        warnCacheFailure({ action: 'clear', error });
      });
  }
}

/**
 * Creates the query cache when Upstash is configured.
 * @returns The cache, or undefined to read the database every time.
 */
export const createQueryCache = () => {
  const url = Env.UPSTASH_REDIS_REST_URL;
  const token = Env.UPSTASH_REDIS_REST_TOKEN;

  return url && token
    ? new SchemaAwareUpstashCache(
        new Redis({ url, token }),
        Object.values(schema).filter((value) => is(value, PgTable)),
      )
    : undefined;
};
