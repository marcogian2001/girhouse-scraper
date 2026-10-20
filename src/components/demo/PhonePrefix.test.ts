import { describe, expect, it } from 'vitest';
import { toE164 } from '@/utils/Phone';
import { withPrefix } from './PhonePrefix';

describe('PhonePrefix', () => {
  it('adds the Italian prefix by default', () => {
    expect(toE164(withPrefix({ dial: '+39', number: '333 123 4567' }))).toBe('+393331234567');
  });

  it('uses the chosen country and drops its trunk zero', () => {
    expect(toE164(withPrefix({ dial: '+41', number: '079 123 45 67' }))).toBe('+41791234567');
  });

  it('keeps a number typed with its own country code', () => {
    expect(withPrefix({ dial: '+39', number: '+44 7700 900123' })).toBe('+44 7700 900123');
  });
});
