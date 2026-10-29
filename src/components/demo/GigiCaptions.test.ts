import { describe, expect, it } from 'vitest';
import { currentCaption, sentenceStarts, splitSentences } from './GigiCaptions';
import { parseHighlights } from './Highlights';

const text = (sentence: { text: string }[]) => sentence.map((segment) => segment.text).join('');

describe('GigiCaptions', () => {
  describe('Sentences', () => {
    it('splits a line after each sentence end', () => {
      const sentences = splitSentences(
        parseHighlights('Ciao! Come va? Bene… e tu. Premi «Avanti».'),
      );

      expect(sentences.map(text)).toStrictEqual([
        'Ciao! ',
        'Come va? ',
        'Bene… ',
        'e tu. ',
        'Premi «Avanti».',
      ]);
    });

    it('keeps the highlights across a sentence end', () => {
      const sentences = splitSentences(parseHighlights('Uno <b>due. tre</b> quattro.'));

      expect(sentences).toStrictEqual([
        [
          { text: 'Uno ', style: 'plain' },
          { text: 'due. ', style: 'bold' },
        ],
        [
          { text: 'tre', style: 'bold' },
          { text: ' quattro.', style: 'plain' },
        ],
      ]);
    });

    it('leaves numbers with a dot in one piece', () => {
      expect(splitSentences(parseHighlights('Costa 2.000 euro. No.')).map(text)).toStrictEqual([
        'Costa 2.000 euro. ',
        'No.',
      ]);
    });
  });

  describe('Starts', () => {
    const sentences = splitSentences(parseHighlights('Aaaa aaaa. Bbbb bbbb. Cccc cccc.'));

    it('spreads the sentences by length without pauses', () => {
      expect(sentenceStarts({ sentences, duration: 32, pauses: [] })).toStrictEqual([0, 11, 22]);
    });

    it('moves a sentence onto the closest pause', () => {
      expect(sentenceStarts({ sentences, duration: 32, pauses: [10, 12.2, 23] })).toStrictEqual([
        0, 10, 23,
      ]);
    });

    it('ignores pauses too far from the sentence', () => {
      expect(sentenceStarts({ sentences, duration: 32, pauses: [5] })).toStrictEqual([0, 11, 22]);
    });
  });

  describe('Current caption', () => {
    const line = parseHighlights('Ecco la <b>timeline</b>: ogni passo resta tracciato. Sai tutto.');

    it('shows only the part being said, after a colon', () => {
      expect(currentCaption(line, 3)).toStrictEqual({
        segments: [
          { text: 'Ecco la ', style: 'plain' },
          { text: 'timeline', style: 'bold' },
          { text: ': ', style: 'plain' },
        ],
        typed: 3,
      });
    });

    it('moves to the next sentence once the previous one is typed', () => {
      expect(currentCaption(line, 60).segments).toStrictEqual([
        { text: 'Sai tutto.', style: 'plain' },
      ]);
    });

    it('keeps the last caption whole once the line is said', () => {
      expect(currentCaption(line, 500)).toStrictEqual({
        segments: [{ text: 'Sai tutto.', style: 'plain' }],
        typed: 10,
      });
    });
  });
});
