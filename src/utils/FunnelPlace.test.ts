import { describe, expect, it } from 'vitest';
import { FUNNEL_PLACE_PREFIX, googlePlaceId } from './FunnelPlace';

describe(googlePlaceId, () => {
  it('keeps a Google place id', () => {
    expect(googlePlaceId('ChIJ123')).toBe('ChIJ123');
  });

  it('drops the stand-in of a funnel lead', () => {
    expect(googlePlaceId(`${FUNNEL_PLACE_PREFIX}abc`)).toBeNull();
  });

  it('returns null without a place id', () => {
    expect(googlePlaceId(null)).toBeNull();
  });
});
