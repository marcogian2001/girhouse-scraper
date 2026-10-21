import { describe, expect, it } from 'vitest';
import { DemoEventValidation, DemoSlugValidation } from './DemoValidation';

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
