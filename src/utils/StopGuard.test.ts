import { describe, expect, it } from 'vitest';
import { isStopRequest } from './StopGuard';

describe('StopGuard', () => {
  describe('Stop requests', () => {
    const replies = [
      'Non scrivetemi più',
      'per favore non mi scrivete',
      'Cancellatemi dalla vostra lista',
      'Rimuovetemi subito',
      'toglietemi dai contatti',
      'Potete cancellarmi?',
      'Rimuovete il mio indirizzo',
      'Non voglio più ricevere queste email',
      'Basta email!',
      'Smettetela',
      'Questo è spam',
      'Vi segnalo come spam',
      'Vi segnalo al Garante',
      'STOP',
      'unsubscribe',
      'Cancellami',
      'le chiedo gentilmente di non inviarci più email',
      'voler revocare con effetto immediato il consenso al trattamento del proprio indirizzo email',
    ];

    it.each(replies)('flags "%s"', (reply) => {
      expect(isStopRequest(reply)).toBeTruthy();
    });
  });

  describe('Other replies', () => {
    const replies = [
      'Non mi interessa, grazie',
      'Siamo a posto così',
      'Non ci serve',
      'Sono fuori ufficio fino al 20 ottobre',
      'Vi segnalo che il titolare è Marco, scrivete a marco@example.com',
      'Quanto costa?',
      'Mi interessa, chiamatemi',
      'Non mi occorre al momento un servizio di questo genere',
      'Grazie per la tua proposta, ne terrò conto.',
      'La Sua mail precedente era finita in spam. Mi mandi pure lo schema',
      'Ho trovato la mail nella cartella spam',
      'era finita nello spam, mi interessa',
    ];

    it.each(replies)('lets "%s" through', (reply) => {
      expect(isStopRequest(reply)).toBeFalsy();
    });
  });
});
