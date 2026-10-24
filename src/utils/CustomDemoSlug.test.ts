import { describe, expect, it } from 'vitest';
import { isCustomDemoSlug, normalizeCustomDemoSlug } from './CustomDemoSlug';

describe('CustomDemoSlug', () => {
  it('normalizes casing and surrounding whitespace', () => {
    expect(normalizeCustomDemoSlug('  Studio-ROSSI  ')).toBe('studio-rossi');
  });

  it.each(['studio-rossi', '123', 'a', 'a'.repeat(60)])('accepts %s', (slug) => {
    expect(isCustomDemoSlug(slug)).toBeTruthy();
  });

  it.each([
    '',
    'a'.repeat(61),
    'studio rossi',
    'caffè',
    'https://example.com',
    '../studio',
    'studio?x=1',
    'studio#x',
    '-studio',
    'studio-',
    'studio--rossi',
    'studio_rossi',
    'api',
    'api-studio',
    'ingest',
    'ingestion',
    'monitoring-studio',
  ])('rejects %s', (slug) => {
    expect(isCustomDemoSlug(slug)).toBeFalsy();
  });
});
