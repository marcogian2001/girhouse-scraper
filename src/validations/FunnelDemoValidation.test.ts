import { describe, expect, it } from 'vitest';
import { FunnelDemoValidation } from './FunnelDemoValidation';

const request = {
  funnel: 'F3',
  ghlContactId: 'abc123',
  name: 'Mario Rossi',
  email: 'Mario@Example.com',
  phone: '+393331234567',
  company: 'Studio Rossi',
  city: 'Bari',
  place: { id: 'places/ChIJ123', rating: 4.8, reviews: 20, website: 'https://studiorossi.it' },
};

describe('funnel demo request', () => {
  it('strips the places prefix from the place id', () => {
    expect(FunnelDemoValidation.parse(request).place.id).toBe('ChIJ123');
  });

  it('lower-cases the email', () => {
    expect(FunnelDemoValidation.parse(request).email).toBe('mario@example.com');
  });

  it('rejects a request without a place', () => {
    expect(FunnelDemoValidation.safeParse({ ...request, place: undefined }).success).toBeFalsy();
  });
});
