import { is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '@/models/Schema';
import { buildDependentTables } from './QueryCache';

const tables = Object.values(schema).filter((value) => is(value, PgTable));

describe('QueryCache', () => {
  describe('Delete dependents', () => {
    const dependents = buildDependentTables({ tables, deletesOnly: true });

    it('reaches the tables a conversation delete cascades to', () => {
      expect(dependents.get('conversation')).toStrictEqual(
        expect.arrayContaining(['inbound_message', 'outbound_email', 'demo']),
      );
    });

    it('reaches tables through more than one foreign key', () => {
      expect(dependents.get('conversation')).toContain('demo_event');
    });

    it('includes tables whose reference is set to null', () => {
      expect(dependents.get('campaign')).toContain('api_usage');
    });

    it('leaves out tables nothing references with a delete action', () => {
      expect(dependents.get('demo_event')).toBeUndefined();
    });
  });

  describe('Read dependents', () => {
    const dependents = buildDependentTables({ tables, deletesOnly: false });

    it('reaches the tables a conversation subquery reads', () => {
      expect(dependents.get('conversation')).toStrictEqual(
        expect.arrayContaining(['inbound_message', 'reply_classification']),
      );
    });

    it('covers at least the delete dependents', () => {
      const deletes = buildDependentTables({ tables, deletesOnly: true });

      for (const [table, reached] of deletes) {
        expect(dependents.get(table)).toStrictEqual(expect.arrayContaining(reached));
      }
    });
  });
});
