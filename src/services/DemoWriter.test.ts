import { describe, expect, it } from 'vitest';
import { renderDemoSources, toDemoContent } from './DemoWriter';

describe('DemoWriter', () => {
  it('lists the known facts and leaves the unknown ones out', () => {
    const rendered = renderDemoSources({
      company: 'Pizzeria Da Mario',
      person: null,
      city: 'Bologna',
      category: 'Pizzeria',
      categories: ['Pizzeria', 'Ristorante'],
      description: null,
      websiteTitle: null,
      websiteDescription: null,
      websiteText: null,
      websiteColors: [],
      websiteFonts: [],
      photoCount: 0,
      hasPortrait: false,
      profileAbout: null,
      profileServices: [],
      profileLocations: [],
      reviewQuotes: [],
      research: null,
      socialBio: null,
      socialPosts: [],
      teamNotes: null,
      referencePages: [],
    });

    expect(rendered).toContain('## Business\nPizzeria Da Mario');
    expect(rendered).toContain('## Other categories\nPizzeria, Ristorante');
    expect(rendered).not.toContain('Website');
    expect(rendered).not.toContain('Services and prices');
  });

  it('lists profile services with their prices and review quotes', () => {
    const rendered = renderDemoSources({
      company: 'Dott.ssa Giada Todisco',
      person: null,
      city: 'Roma',
      category: null,
      categories: [],
      description: null,
      websiteTitle: null,
      websiteDescription: null,
      websiteText: null,
      websiteColors: [],
      websiteFonts: [],
      photoCount: 0,
      hasPortrait: false,
      profileAbout: 'Biologa nutrizionista',
      profileServices: [
        { name: 'Prima Visita', price: '100 €' },
        { name: 'Controllo peso', price: null },
      ],
      profileLocations: ['Via Garigliano 17, Cassino'],
      reviewQuotes: ['Empatica e preparata'],
      research: null,
      socialBio: null,
      socialPosts: [],
      teamNotes: null,
      referencePages: [],
    });

    expect(rendered).toContain('## Services and prices\nPrima Visita: 100 €\nControllo peso');
    expect(rendered).toContain('## What patients say in reviews\n- Empatica e preparata');
  });

  it('lists the research and the Instagram profile', () => {
    const rendered = renderDemoSources({
      company: 'Roberta Russo',
      person: 'Roberta Russo',
      city: null,
      category: null,
      categories: [],
      description: null,
      websiteTitle: null,
      websiteDescription: null,
      websiteText: null,
      websiteColors: [],
      websiteFonts: [],
      photoCount: 0,
      hasPortrait: false,
      profileAbout: null,
      profileServices: [],
      profileLocations: [],
      reviewQuotes: [],
      research: 'Educatrice e puericultrice',
      socialBio: 'La puericultrice delle mamme',
      socialPosts: ['Il sonno del neonato'],
      teamNotes: 'Lavora a domicilio',
      referencePages: ['Roberta Russo - Materno Infantile'],
    });

    expect(rendered).toContain(
      '## What research on the professional found\nEducatrice e puericultrice',
    );
    expect(rendered).toContain('## Instagram bio\nLa puericultrice delle mamme');
    expect(rendered).toContain('## Recent Instagram posts\n- Il sonno del neonato');
    expect(rendered).toContain('## Notes from the Girhouse team\nLavora a domicilio');
    expect(rendered).toContain('## Reference pages about the business\nRoberta Russo');
  });

  it('lists the website colours and fonts and the photos the page can show', () => {
    const rendered = renderDemoSources({
      company: 'Erboristeria Salvia',
      person: null,
      city: null,
      category: null,
      categories: [],
      description: null,
      websiteTitle: null,
      websiteDescription: null,
      websiteText: null,
      websiteColors: ['#5b7f4a', '#c8a96b'],
      websiteFonts: ['Lora'],
      photoCount: 3,
      hasPortrait: true,
      profileAbout: null,
      profileServices: [],
      profileLocations: [],
      reviewQuotes: [],
      research: null,
      socialBio: null,
      socialPosts: [],
      teamNotes: null,
      referencePages: [],
    });

    expect(rendered).toContain('## Website colours\n#5b7f4a, #c8a96b');
    expect(rendered).toContain('## Website fonts\nLora');
    expect(rendered).toContain(
      '## Photos available for the page\n3, plus a portrait of the professional',
    );
  });
});

describe('DemoWriter content', () => {
  const content = toDemoContent({
    titolo: 'Osteopatia a Roma — per tutta la famiglia',
    sottotitolo: 'Prenota su WhatsApp',
    chi_siamo: null,
    cta: 'Prenota una visita',
    servizi: [{ nome: 'Osteopatia pediatrica', descrizione: null, prezzo: '60 €' }],
    perche_sceglierci: [
      { titolo: 'Mani esperte', testo: 'Dieci pazienti lo dicono.' },
      { titolo: 'Ascolto', testo: 'Ogni visita parte da te.' },
      { titolo: 'Vicino a te', testo: 'Studio a Roma Nord.' },
      { titolo: 'Bambini', testo: 'Anche per i più piccoli.' },
      { titolo: 'Extra', testo: 'Di troppo.' },
    ],
    percorso: [],
    faq: [{ domanda: 'Dove riceve?', risposta: 'A Roma — zona Prati.' }],
    design: {
      font: 'warm',
      hero: 'split',
      servizi: 'list',
      sfondo: 'warm',
      angoli: 'round',
      colore_principale: '#3A7D6B',
      colore_accento: '#f5f5f5',
      ordine_sezioni: ['about', 'reviews', 'about'],
    },
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

  it('keeps up to 4 reasons and cleans the questions', () => {
    expect(content.landing.highlights).toHaveLength(4);
    expect(content.landing.steps).toStrictEqual([]);
    expect(content.landing.faqs).toStrictEqual([
      { question: 'Dove riceve?', answer: 'A Roma, zona Prati.' },
    ]);
  });

  it('puts every body section once, the picked ones first', () => {
    expect(content.design.sectionOrder).toStrictEqual([
      'about',
      'reviews',
      'services',
      'highlights',
      'steps',
      'faq',
    ]);
  });

  it('keeps usable colours only', () => {
    expect(content.colors).toStrictEqual({ primary: '#3a7d6b', accent: null });
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
