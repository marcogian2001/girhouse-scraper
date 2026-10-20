import { describe, expect, it } from 'vitest';
import { createDemoSlug } from './DemoSlug';

describe('DemoSlug', () => {
  it('starts with the business name and ends with a random suffix', () => {
    expect(createDemoSlug('Pizzeria Da Mario')).toMatch(/^pizzeria-da-mario-[0-9a-zA-Z]{10}$/u);
  });

  it('gives two demos of the same business different slugs', () => {
    expect(createDemoSlug('Bar Roma')).not.toBe(createDemoSlug('Bar Roma'));
  });

  it('falls back to the suffix alone for a name with no letters', () => {
    expect(createDemoSlug('***')).toMatch(/^[0-9a-zA-Z]{10}$/u);
  });

  it('keeps long names short', () => {
    expect(createDemoSlug('A'.repeat(100)).length).toBeLessThanOrEqual(51);
  });
});
