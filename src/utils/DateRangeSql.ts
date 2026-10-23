import { and, gte, lt, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { AppConfig } from './AppConfig';
import type { DateRange } from './DateRange';

/**
 * Turns a calendar day in the app time zone into the UTC wall time a
 * `timestamp` column holds, so the comparison stays on the bare column.
 * @param day A SQL date expression.
 * @returns The moment that day starts.
 */
const startOfLocalDay = (day: ReturnType<typeof sql>) =>
  sql`((${day})::timestamp AT TIME ZONE ${sql.raw(`'${AppConfig.timeZone}'`)}) AT TIME ZONE 'UTC'`;

/**
 * Keeps the rows whose timestamp falls on one of the range's days, in the app
 * time zone. The column is compared as is, so an index on it applies.
 * @param column A `timestamp` column holding UTC wall time.
 * @param range The days, inclusive.
 * @returns The WHERE condition.
 */
export const withinLocalDays = (column: AnyPgColumn, range: DateRange) =>
  and(
    gte(column, startOfLocalDay(sql`${range.from}::date`)),
    lt(column, startOfLocalDay(sql`${range.to}::date + 1`)),
  );
