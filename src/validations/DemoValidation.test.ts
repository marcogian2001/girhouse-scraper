import { describe, expect, it } from 'vitest';
import { DemoCreateValidation, DemoEventValidation, DemoSlugValidation } from './DemoValidation';

describe('DemoValidation', () => {
  it('accepts a step event within the demo', () => {
    expect(
      DemoEventValidation.safeParse({ type: 'step', sessionId: 'abcdef123456', step: 6 }).success,
    ).toBeTruthy();
  });

  it('rejects a step beyond the last one', () => {
    expect(
      DemoEventValidation.safeParse({ type: 'step', sessionId: 'abcdef123456', step: 7 }).success,
    ).toBeFalsy();
  });

  it('rejects an event the page never sends', () => {
    expect(
      DemoEventValidation.safeParse({ type: 'phone_submitted', sessionId: 'abcdef123456' }).success,
    ).toBeFalsy();
  });

  it('rejects a slug with path characters', () => {
    expect(DemoSlugValidation.safeParse('pizzeria-da-mario').success).toBeTruthy();
    expect(DemoSlugValidation.safeParse('pizzeria-da-mario-a1B2c3D4e5').success).toBeTruthy();
    expect(DemoSlugValidation.safeParse('../../etc/passwd-a1B2c3').success).toBeFalsy();
  });
});

describe('Demo creation input', () => {
  it.each([{}, { slug: '' }, { slug: '   ' }])('keeps automatic generation for %j', (input) => {
    const parsed = DemoCreateValidation.parse(input);
    expect(parsed.slug).toBeUndefined();
  });

  it('normalizes a chosen slug without shortening it', () => {
    expect(DemoCreateValidation.parse({ slug: '  Studio-ROSSI  ' }).slug).toBe('studio-rossi');
    expect(DemoCreateValidation.safeParse({ slug: 'a'.repeat(61) }).success).toBeFalsy();
  });

  it.each([null, [], 'studio', { slug: null }, { slug: 42 }, { slug: 'studio rossi' }])(
    'rejects an invalid body %j',
    (input) => {
      expect(DemoCreateValidation.safeParse(input).success).toBeFalsy();
    },
  );

  it('preserves the public validation of historical slugs', () => {
    expect(DemoSlugValidation.safeParse('Studio-a1B2c3D4e5').success).toBeTruthy();
    expect(DemoSlugValidation.safeParse('a'.repeat(80)).success).toBeTruthy();
  });
});
