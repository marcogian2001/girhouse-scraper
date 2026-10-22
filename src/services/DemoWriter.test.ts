import { describe, expect, it } from 'vitest';
import { renderDemoSources, toDemoContent } from './DemoWriter';

describe('DemoWriter', () => {
  it('lists the known facts and leaves the unknown ones out', () => {
    const rendered = renderDemoSources({
      company: 'Pizzeria Da Mario',
      city: 'Bologna',
      category: 'Pizzeria',
      categories: ['Pizzeria', 'Ristorante'],
      description: null,
      websiteTitle: null,
      websiteDescription: null,
      websiteText: null,
      profileAbout: null,
      profileServices: [],
      profileLocations: [],
      reviewQuotes: [],
    });

    expect(rendered).toContain('## Business\nPizzeria Da Mario');
    expect(rendered).toContain('## Other categories\nPizzeria, Ristorante');
    expect(rendered).not.toContain('Website');
    expect(rendered).not.toContain('Services and prices');
  });

  it('lists profile services with their prices and review quotes', () => {
    const rendered = renderDemoSources({
      company: 'Dott.ssa Giada Todisco',
      city: 'Roma',
      category: null,
      categories: [],
      description: null,
      websiteTitle: null,
      websiteDescription: null,
      websiteText: null,
      profileAbout: 'Biologa nutrizionista',
      profileServices: [
        { name: 'Prima Visita', price: '100 €' },
        { name: 'Controllo peso', price: null },
      ],
      profileLocations: ['Via Garigliano 17, Cassino'],
      reviewQuotes: ['Empatica e preparata'],
    });

    expect(rendered).toContain('## Services and prices\nPrima Visita: 100 €\nControllo peso');
    expect(rendered).toContain('## What patients say in reviews\n- Empatica e preparata');
  });
});

describe('DemoWriter content', () => {
  const content = toDemoContent({
    titolo: 'Osteopatia a Roma — per tutta la famiglia',
    sottotitolo: 'Prenota su WhatsApp',
    chi_siamo: null,
    cta: 'Prenota una visita',
    servizi: [{ nome: 'Osteopatia pediatrica', descrizione: null, prezzo: '60 €' }],
    chat: {
      nome_cliente: 'Giulia',
      servizio: 'Osteopatia pediatrica',
      nota: 'Settimo mese — mal di schiena',
      messaggi: [
        { da: 'cliente', testo: 'Buongiorno, vorrei prenotare', opzioni: ['ignored'] },
        {
          da: 'attivita',
          testo: 'Quando preferisce?',
          opzioni: ['Martedì alle 10:00', 'Giovedì alle 17:30'],
        },
        { da: 'cliente', testo: '', opzioni: [] },
      ],
    },
  });

  it('removes forbidden dashes', () => {
    expect(content.landing.headline).toBe('Osteopatia a Roma, per tutta la famiglia');
    expect(content.chat.note).toBe('Settimo mese, mal di schiena');
  });

  it('keeps buttons on business messages only and drops empty messages', () => {
    expect(content.chat.messages).toStrictEqual([
      { from: 'customer', text: 'Buongiorno, vorrei prenotare', options: [] },
      {
        from: 'business',
        text: 'Quando preferisce?',
        options: ['Martedì alle 10:00', 'Giovedì alle 17:30'],
      },
    ]);
  });
});
