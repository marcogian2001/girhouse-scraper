import { describe, expect, it } from 'vitest';
import { parseHighlights, sliceHighlights, stripHighlights, visibleLength } from './Highlights';

describe('Highlights', () => {
  const segments = parseHighlights('Ciao, sono <b>Gigi</b> e questa è la <mark>tua pagina</mark>.');

  it('splits a line into plain, bold and highlighted runs', () => {
    expect(segments).toStrictEqual([
      { text: 'Ciao, sono ', style: 'plain' },
      { text: 'Gigi', style: 'bold' },
      { text: ' e questa è la ', style: 'plain' },
      { text: 'tua pagina', style: 'mark' },
      { text: '.', style: 'plain' },
    ]);
  });

  it('keeps a line without tags whole', () => {
    expect(parseHighlights('Avanti!')).toStrictEqual([{ text: 'Avanti!', style: 'plain' }]);
  });

  it('counts only the visible characters', () => {
    expect(visibleLength(segments)).toBe('Ciao, sono Gigi e questa è la tua pagina.'.length);
  });

  it('cuts the typed text across runs, keeping their styles', () => {
    expect(sliceHighlights(segments, 13)).toStrictEqual([
      { text: 'Ciao, sono ', style: 'plain' },
      { text: 'Gi', style: 'bold' },
    ]);
  });

  it('strips the tags for the voice-over', () => {
    expect(stripHighlights('Sono <b>Gigi</b> di <hl>Girhouse</hl>')).toBe('Sono Gigi di Girhouse');
  });
});
