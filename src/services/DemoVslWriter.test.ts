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
  recensione: {
    nome_cliente: 'Giulia',
    messaggio: 'Grazie Giulia — ci lasci una recensione su Google?',
    risposta: 'Fatto!',
  },
  fai_da_te: {
    parole_chiave: ['autofficina taranto', 'tagliando taranto', 'revisione auto taranto', 'gomme'],
    articoli_blog: ['Ogni quanto fare il tagliando — davvero'],
  },
  social: {
    nome_cliente: 'Elena',
    commento: 'Info?',
    messaggio: 'Ciao Elena — come posso aiutarti?',
    risposta: 'Vorrei un preventivo',
  },
  chiamata_persa: {
    nome_cliente: 'Sara',
    messaggio: 'Ciao Sara, scusa — ero sotto una macchina. Come posso aiutarti?',
    risposta: 'Volevo un preventivo per i freni.',
  },
  battute: {
    video_line_loss_not_found: 'Ciao! <b>Gianmarco</b> qui.',
    video_line_google: '',
    video_line_site_hero: '',
    video_line_loss_not_chosen: '',
    video_line_review_request: '',
    video_line_loss_lost: '',
    video_line_missed_call: '',
    video_line_chat_start: 'Luca scrive — e la risposta parte',
    video_line_chat_booked: '   ',
    video_line_loss_social: '',
    video_line_social: '',
    video_line_inbox: '',
    video_line_loss_not_back: '',
    video_line_reminder: '',
  },
  foto: {
    video_line_loss_not_found: 'A woman searches on her phone at home.',
    video_line_loss_not_chosen: '  ',
    video_line_loss_lost: '',
    video_line_loss_social: '',
    video_line_loss_not_back: '',
  },
};

describe('DemoVslWriter', () => {
  it('keeps the first three pain points', () => {
    expect(toDemoVsl(texts).pains).toHaveLength(3);
  });

  it('keeps only the lines the AI wrote, without dashes', () => {
    expect(toDemoVsl(texts).lines).toStrictEqual({
      video_line_loss_not_found: 'Ciao! <b>Gianmarco</b> qui.',
      video_line_chat_start: 'Luca scrive, e la risposta parte',
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

  it('keeps the review request, without dashes', () => {
    expect(toDemoVsl(texts).reviewRequest).toStrictEqual({
      customerName: 'Giulia',
      message: 'Grazie Giulia, ci lasci una recensione su Google?',
      reply: 'Fatto!',
    });
  });

  it('keeps three examples of what can be done alone, without dashes', () => {
    expect(toDemoVsl(texts).diy).toStrictEqual({
      keywords: ['autofficina taranto', 'tagliando taranto', 'revisione auto taranto'],
      blogTitles: ['Ogni quanto fare il tagliando, davvero'],
    });
  });

  it('keeps the social request, without dashes', () => {
    expect(toDemoVsl(texts).socialRequest).toStrictEqual({
      customerName: 'Elena',
      comment: 'Info?',
      message: 'Ciao Elena, come posso aiutarti?',
      reply: 'Vorrei un preventivo',
    });
  });

  it('keeps only the photo prompts the AI wrote, trimmed', () => {
    expect(toDemoVsl(texts).images).toStrictEqual({
      video_line_loss_not_found: 'A woman searches on her phone at home.',
    });
  });
});
