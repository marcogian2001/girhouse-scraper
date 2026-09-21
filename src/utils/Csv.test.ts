import { describe, expect, it } from 'vitest';
import { autoDetectMapping, toContactRows } from './Csv';

describe('Csv', () => {
  describe('Column auto-detection', () => {
    it('matches headers regardless of case, spacing and separators', () => {
      const mapping = autoDetectMapping(['E-Mail', 'First Name', 'last_name', 'PHONE']);

      expect(mapping).toStrictEqual({
        email: 'E-Mail',
        firstName: 'First Name',
        lastName: 'last_name',
        phone: 'PHONE',
      });
    });

    it('matches Italian headers', () => {
      const mapping = autoDetectMapping(['Nome', 'Cognome', 'Email', 'Azienda', 'Telefono']);

      expect(mapping).toStrictEqual({
        firstName: 'Nome',
        lastName: 'Cognome',
        email: 'Email',
        company: 'Azienda',
        phone: 'Telefono',
      });
    });

    it('leaves unknown headers unmapped', () => {
      const mapping = autoDetectMapping(['email', 'lead score', 'notes']);

      expect(mapping).toStrictEqual({ email: 'email' });
    });

    it('assigns each header to a single field', () => {
      const mapping = autoDetectMapping(['email', 'email']);

      expect(Object.values(mapping)).toHaveLength(1);
    });
  });

  describe('Row mapping', () => {
    const mapping = { email: 'Email', firstName: 'Nome', company: 'Azienda' };

    it('keeps unmapped columns in extra', () => {
      const rows = toContactRows({
        rows: [{ Email: 'ada@example.com', Nome: 'Ada', Azienda: 'Analytical', Segment: 'SMB' }],
        mapping,
      });

      expect(rows).toStrictEqual([
        {
          email: 'ada@example.com',
          firstName: 'Ada',
          lastName: undefined,
          phone: undefined,
          company: 'Analytical',
          website: undefined,
          linkedinUrl: undefined,
          extra: { Segment: 'SMB' },
        },
      ]);
    });

    it('drops rows without an email', () => {
      const rows = toContactRows({
        rows: [
          { Email: '', Nome: 'Ada' },
          { Email: 'grace@example.com', Nome: 'Grace' },
        ],
        mapping,
      });

      expect(rows).toHaveLength(1);
      expect(rows.at(0)?.email).toBe('grace@example.com');
    });

    it('drops rows whose email is not a valid address', () => {
      const rows = toContactRows({
        rows: [
          { Email: 'Ada Lovelace <ada@example.com>', Nome: 'Ada' },
          { Email: 'grace@', Nome: 'Grace' },
          { Email: 'katherine@example.com', Nome: 'Katherine' },
        ],
        mapping,
      });

      expect(rows).toHaveLength(1);
      expect(rows.at(0)?.email).toBe('katherine@example.com');
    });

    it('trims values and ignores blank extra columns', () => {
      const rows = toContactRows({
        rows: [{ Email: '  ada@example.com  ', Nome: ' Ada ', Segment: '   ' }],
        mapping,
      });

      expect(rows.at(0)?.email).toBe('ada@example.com');
      expect(rows.at(0)?.firstName).toBe('Ada');
      expect(rows.at(0)?.extra).toStrictEqual({});
    });
  });
});
