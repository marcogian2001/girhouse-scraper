import { describe, expect, it } from 'vitest';
import type { WriteReplyOptions } from './ReplyWriter';
import { buildWriterPrompt, renderScarcity, replySubject } from './ReplyWriter';

const options: WriteReplyOptions = {
  model: 'claude-opus-5-5',
  offer: 'Offerta',
  scarcity: 'Prendiamo solo 10 nuove attività al mese.',
  category: 'objection',
  objection: { title: 'Ho già un sito', responseAngle: 'Il punto è chi risponde ai contatti.' },
  lead: {
    company: 'Pizzeria Da Mario',
    contactName: 'Mario Rossi',
    city: null,
    category: null,
    description: null,
    website: null,
    rating: null,
    reviewsCount: null,
  },
  thread: [{ direction: 'outbound', sentAt: null, text: 'Ciao Mario\nLuca' }],
  reply: 'Abbiamo già un sito.',
  call: null,
  issues: [],
};

describe('ReplyWriter', () => {
  describe('Subject', () => {
    it('keeps a subject that is already a reply', () => {
      expect(replySubject('Re: la tua pizzeria', 'Pizzeria')).toBe('Re: la tua pizzeria');
    });

    it('turns a subject into a reply', () => {
      expect(replySubject('la tua pizzeria', 'Pizzeria')).toBe('Re: la tua pizzeria');
    });

    it('falls back when the subject is unknown', () => {
      expect(replySubject(null, 'Pizzeria Da Mario')).toBe('Re: Pizzeria Da Mario');
    });
  });

  describe('Scarcity', () => {
    it('states only the monthly limit, with no deadline', () => {
      expect(renderScarcity(10)).toBe('Prendiamo solo 10 nuove attività al mese.');
    });
  });

  describe('Prompt', () => {
    it('includes the category guidance and the objection angle', () => {
      const prompt = buildWriterPrompt(options);

      expect(prompt).toContain('angle from the objection library entry');
      expect(prompt).toContain('The angle wins over everything else here');
      expect(prompt).toContain('Angle: Il punto è chi risponde ai contatti.');
      expect(prompt).toContain("## The lead's reply\nAbbiamo già un sito.");
    });

    it('sends the demo link without offering a call', () => {
      const prompt = buildWriterPrompt({ ...options, category: 'interested' });

      expect(prompt).toContain('{{link_demo}}');
      expect(prompt).not.toContain('{{orari}}');
    });

    it('confirms a booked call instead of the category guidance', () => {
      const prompt = buildWriterPrompt({
        ...options,
        category: 'interested',
        call: { kind: 'booked', when: 'martedì 20 ottobre alle 9:00' },
      });

      expect(prompt).toContain('the call is booked for martedì 20 ottobre alle 9:00');
      expect(prompt).not.toContain('{{link_demo}}');
    });

    it('offers other times when the asked one is gone', () => {
      const prompt = buildWriterPrompt({
        ...options,
        category: 'interested',
        call: { kind: 'taken' },
      });

      expect(prompt).toContain('no longer free');
      expect(prompt).not.toContain('{{link_demo}}');
    });

    it('follows up a lead who never opened the demo with the link again', () => {
      const prompt = buildWriterPrompt({ ...options, followUp: 'demo_not_opened' });

      expect(prompt).toContain('it was never opened');
      expect(prompt).toContain('{{link_demo}}');
      expect(prompt).toContain("## The lead's last reply, a while ago");
    });

    it('closes the sequence with the call times', () => {
      const prompt = buildWriterPrompt({ ...options, followUp: 'closing' });

      expect(prompt).toContain('This is the last email of the sequence');
      expect(prompt).toContain('{{orari}}');
    });

    it('writes an answer leaving on a later day for that day', () => {
      const prompt = buildWriterPrompt({
        ...options,
        category: 'not_now',
        recontactOn: 'lunedì 26 ottobre',
      });

      expect(prompt).toContain('lunedì 26 ottobre, days after the lead');
      expect(prompt).toContain('picks the conversation up again');
    });

    it('leaves the send day out of an answer sent at once', () => {
      expect(buildWriterPrompt(options)).not.toContain('When this email leaves');
    });

    it('lists the problems of a previous attempt', () => {
      expect(buildWriterPrompt({ ...options, issues: ['too_long'] })).toContain(
        '## Fix these problems of the previous attempt\ntoo_long',
      );
    });
  });
});
