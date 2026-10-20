import { describe, expect, it } from 'vitest';
import { parseReferral } from './Referral';

describe('Referral', () => {
  it('reads the name and the email of the person pointed to', () => {
    expect(parseReferral('Mario Rossi, Mario.Rossi@Studio.it')).toStrictEqual({
      email: 'mario.rossi@studio.it',
      firstName: 'Mario',
      lastName: 'Rossi',
    });
  });

  it('leaves the title out of the name', () => {
    expect(parseReferral('Dott.ssa Giulia Neri - giulia@studio.it')).toStrictEqual({
      email: 'giulia@studio.it',
      firstName: 'Giulia',
      lastName: 'Neri',
    });
    expect(parseReferral('Dott. Marco Bianchi, marco@studio.it')?.lastName).toBe('Bianchi');
  });

  it('reads an email alone', () => {
    expect(parseReferral('<info@pizzeria.com>')).toStrictEqual({
      email: 'info@pizzeria.com',
      firstName: null,
      lastName: null,
    });
  });

  it('returns null when the referral has no email', () => {
    expect(parseReferral('il titolare, Giulia')).toBeNull();
    expect(parseReferral(null)).toBeNull();
  });
});
