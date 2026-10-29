import { describe, expect, it } from 'vitest';
import type { DemoVslTexts } from './DemoVslWriter';
import { toDemoVsl } from './DemoVslWriter';

const texts: DemoVslTexts = {
  dolori: [
    'Preventivi a cui si risponde tardi',
    'Scadenze scritte a mano',
    'Numeri sparsi',
    'Altro',
  ],
  chat: {
    nome_cliente: 'Luca',
    servizio: null,
    nota: 'Rumore ai freni — preferisce la mattina',
    messaggi: [
      { da: 'cliente', testo: 'Ciao, mi fate un preventivo?', opzioni: ['Sì'] },
      { da: 'attivita', testo: 'Certo! Quale preferisci?', opzioni: ['Martedì alle 9:00'] },
      { da: 'cliente', testo: '  ', opzioni: [] },
    ],
  },
  promemoria: {
    titolo: 'Promemoria revisione',
    nome_cliente: 'Anna',
    messaggi: [{ da: 'attivita', testo: 'Ciao Anna, la revisione scade il 14', opzioni: [] }],
  },
  follow_up: {
    nome_cliente: 'Marco',
    quando: 'Marco non risponde al preventivo',
    whatsapp: 'Ciao Marco, ti tengo da parte un orario?',
    oggetto_email: 'Il tuo preventivo',
    testo_email: 'Ciao Marco, ti avevamo scritto. Rispondi pure qui.',
  },
  chiamata_persa: {
    nome_cliente: 'Sara',
    messaggio: 'Ciao Sara, scusa — ero sotto una macchina. Come posso aiutarti?',
    risposta: 'Volevo un preventivo per i freni.',
  },
  battute: {
    intro: 'Ciao! <b>Gianmarco</b> qui.',
    problem_missed_call: '',
    missed_call: '',
    problem_whatsapp: '',
    problem_reminder: '',
    problem_followup: '',
    problem_reviews: '',
    reviews: '',
    dream: '',
    landing_hero: '',
    landing_services: '',
    landing_about: '',
    landing_highlights: '',
    landing_steps: '',
    landing_faq: '',
    chat_start: 'Luca scrive — e la risposta parte',
    chat_slots: '   ',
    chat_booked: '',
    reminder: '',
    crm_contact: '',
    crm_timeline: '',
    crm_pipeline: '',
    crm_inbox: '',
    followup: '',
  },
  foto: {
    problem_missed_call: ' A mechanic under a car while a phone rings on the bench. ',
    problem_whatsapp: '',
    problem_reminder: '',
    problem_followup: '',
    problem_reviews: '',
    dream: 'The mechanic smiles at a customer picking up a car.',
  },
};

describe('DemoVslWriter', () => {
  it('keeps the first three pain points', () => {
    expect(toDemoVsl(texts).pains).toHaveLength(3);
  });

  it('keeps only the lines the AI wrote, without dashes', () => {
    expect(toDemoVsl(texts).lines).toStrictEqual({
      intro: 'Ciao! <b>Gianmarco</b> qui.',
      chat_start: 'Luca scrive, e la risposta parte',
    });
  });

  it('keeps buttons on the business side only and drops empty messages', () => {
    expect(toDemoVsl(texts).chat.messages).toStrictEqual([
      { from: 'customer', text: 'Ciao, mi fate un preventivo?', options: [] },
      { from: 'business', text: 'Certo! Quale preferisci?', options: ['Martedì alle 9:00'] },
    ]);
  });

  it('waits for the voice', () => {
    expect(toDemoVsl(texts).voice).toBe('pending');
  });

  it('keeps the missed call, without dashes', () => {
    expect(toDemoVsl(texts).missedCall).toStrictEqual({
      customerName: 'Sara',
      message: 'Ciao Sara, scusa, ero sotto una macchina. Come posso aiutarti?',
      reply: 'Volevo un preventivo per i freni.',
    });
  });

  it('keeps only the photo prompts the AI wrote, trimmed', () => {
    expect(toDemoVsl(texts).images).toStrictEqual({
      problem_missed_call: 'A mechanic under a car while a phone rings on the bench.',
      dream: 'The mechanic smiles at a customer picking up a car.',
    });
  });
});
