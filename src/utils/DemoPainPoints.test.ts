import { describe, expect, it } from 'vitest';
import { findSectorPainPoints, renderPainPlaybook } from './DemoPainPoints';

const sectorOf = (category: string | null, company = 'Studio Rossi') =>
  findSectorPainPoints({ category, categories: [], company })?.sector ?? null;

describe('DemoPainPoints', () => {
  describe('Sector', () => {
    it('finds the sector from the Google category', () => {
      expect(sectorOf('Fisioterapista')).toMatch(/Fisioterapia/u);
      expect(sectorOf('Autofficina')).toMatch(/Officina/u);
      expect(sectorOf('Avvocato')).toMatch(/Avvocato/u);
    });

    it('falls back on the business name', () => {
      expect(sectorOf(null, 'Nutrizionista Dott. Bianchi')).toMatch(/Nutrizionista/u);
    });

    it('ignores words that only start like a sector', () => {
      expect(sectorOf('Spazio eventi', 'Spazio Bianco')).toBeNull();
    });
  });

  describe('Playbook', () => {
    it('leads with the business sector and keeps the others as examples', () => {
      const playbook = renderPainPlaybook(
        findSectorPainPoints({ category: 'Autofficina', categories: [], company: 'Rossi' }),
      );

      expect(playbook.indexOf('revisione')).toBeLessThan(playbook.indexOf('## Altri settori'));
      expect(playbook).toContain('Fisioterapia');
    });

    it('asks the AI to deduce the sector when none fits', () => {
      expect(renderPainPlaybook(null)).toContain('deducilo dalle fonti');
    });
  });
});
