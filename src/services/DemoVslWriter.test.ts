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
  battute: {
    intro: 'Ciao! <b>Gigi</b> qui.',
    landing_hero: null,
    landing_services: null,
    landing_about: null,
    landing_highlights: null,
    landing_steps: null,
    landing_faq: null,
    chat_start: 'Luca scrive — e la risposta parte',
    chat_slots: '   ',
    chat_booked: null,
    reminder: null,
    crm_contact: null,
    crm_timeline: null,
    crm_pipeline: null,
    crm_inbox: null,
    followup: null,
  },
};

describe('DemoVslWriter', () => {
  it('keeps the first three pain points', () => {
    expect(toDemoVsl(texts).pains).toHaveLength(3);
  });

  it('keeps only the lines the AI wrote, without dashes', () => {
    expect(toDemoVsl(texts).lines).toStrictEqual({
      intro: 'Ciao! <b>Gigi</b> qui.',
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
});
