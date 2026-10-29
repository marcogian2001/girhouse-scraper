/**
 * What small businesses told the Girhouse team on sales calls, by sector: what wears them
 * out, the reminders their customers need, how a silent customer is chased and what must
 * not be said. The version B demo is written from the entry that fits the lead, so Gigi
 * talks about the business's own day rather than features.
 */
export type SectorPainPoints = {
  sector: string;
  // Patterns in the Google category or the business name, lower-cased, that point to this sector
  matches: RegExp[];
  pains: string[];
  // The recurring reminder this kind of business sends, the one the demo shows
  reminder: string;
  // Who a follow-up chases when they stop answering
  followUp: string;
  // What this kind of business is sensitive about, so the demo never sounds wrong to them
  care: string | null;
};

const SECTOR_PAIN_POINTS: SectorPainPoints[] = [
  {
    sector: 'Fisioterapia, osteopatia, riabilitazione, chiropratica',
    matches: [/\b(?:fisioterap|osteopat|riabilita|chiropr|posturolog|massoterap)/u],
    pains: [
      'La segretaria passa la giornata a fissare, spostare e ricordare sedute, e a richiamare chi salta una terapia o arriva in ritardo.',
      "L'agenda è un incastro: durata diversa per ogni terapia, box e macchinari limitati (tecar, laser), lo stesso terapista per tutto il ciclo.",
      'Chi arriva dalla pubblicità prenota la prima visita gratuita e poi non si presenta: agenda piena sulla carta, mezza vuota nei fatti.',
      'Il lavoro arriva soprattutto dal passaparola del quartiere: le richieste da internet sono poche e vanno prese al volo.',
      'Le recensioni si chiedono solo ai pazienti contenti, al momento giusto, e oggi lo fa la segretaria a mano.',
    ],
    reminder:
      'Promemoria della seduta del giorno dopo, con la possibilità di confermare o spostare; richiamo per il controllo o il mantenimento qualche settimana dopo la fine del ciclo.',
    followUp:
      'Chi ha fatto la prima valutazione e non ha ancora fissato il ciclo, o chi ha interrotto le sedute.',
    care: 'È sanità: i messaggi devono essere gentili e mai pressanti. Un promemoria che suona come un obbligo fa sentire il paziente "in gabbia". Il tono è di chi si prende cura, il ritmo e il momento li decide lo studio.',
  },
  {
    sector: 'Officina, autofficina, carrozzeria, gommista, centro revisioni, concessionaria',
    matches: [
      /\b(?:autofficin|officin|meccanic|carrozz|gommist|revision|concessionari|elettrauto|pneumatic)/u,
      /\b(?:auto|moto|autosalone|autoricambi)\b/u,
    ],
    pains: [
      'Arrivano richieste di preventivo e di informazioni su WhatsApp e dalle inserzioni, ma si risponde la sera o il giorno dopo: a quel punto il cliente è già andato altrove.',
      'Ogni reparto (accettazione, meccanica, vendite, assicurazioni) ha il suo numero WhatsApp Business e nessuno ha la visione completa di chi ha scritto e di chi ha risposto.',
      'Ogni mese si estrae un Excel con 100-300 scadenze (revisione, assicurazione, tagliando, cambio gomme) e una persona scrive a ognuno, uno per uno, su WhatsApp.',
      'Si paga per video e pubblicità che portano contatti, e poi i contatti restano senza risposta: soldi buttati.',
    ],
    reminder:
      "Avviso automatico di scadenza della revisione (o dell'assicurazione, del tagliando, del cambio gomme stagionale) con targa o modello dell'auto e due orari liberi per prenotare.",
    followUp:
      'Chi ha chiesto un preventivo e non ha più risposto, o chi ha la revisione in scadenza e non ha prenotato.',
    care: "Preferiscono WhatsApp alla voce automatica: i clienti chiudono il telefono se sentono un risponditore. Le cose delicate le gestisce sempre una persona dell'officina.",
  },
  {
    sector: 'Avvocato, studio legale, commercialista, notaio, consulente del lavoro',
    matches: [
      /\b(?:avvocat|studio legale|commercialist|notai|consulente del lavoro|patronat|tributarist)/u,
    ],
    pains: [
      'Senza segretaria il professionista fa tutto da solo: risponde al fisso, fissa gli appuntamenti, ricorda le scadenze.',
      'Il numero fisso squilla quando si è in udienza o con un cliente e nessuno risponde: chiamate e nuovi clienti persi.',
      "C'è chi per prendere un appuntamento vuole parlare venticinque minuti al telefono: serve capire prima di cosa ha bisogno e se il caso è nelle proprie materie.",
      'Non si vuole mettere il cellulare personale sul sito: serve un modo per farsi contattare senza dare il numero.',
    ],
    reminder:
      "Promemoria dell'appuntamento in studio con i documenti da portare; avviso di una scadenza (dichiarazione, rinnovo, termine) concordata con il cliente.",
    followUp: "Chi ha chiesto una consulenza dal sito e poi non ha fissato l'appuntamento.",
    care: "Tono sobrio e professionale, mai commerciale. Niente consigli legali o fiscali nei messaggi automatici: raccolgono le informazioni e fissano l'appuntamento, il resto lo fa il professionista.",
  },
  {
    sector: 'Nutrizionista, dietista, biologo nutrizionista, naturopata',
    matches: [/\b(?:nutrizion|dietist|dietolog|naturopat|erborist|biologo nutrizionista)/u],
    pains: [
      'Lavora da solo: il giorno prima scrive a mano a ogni paziente su WhatsApp per ricordargli la visita.',
      'Tanti chiedono quanto costa e come funziona la prima visita: ogni volta cerca il messaggio salvato, copia e incolla.',
      "Alcuni pazienti non riescono a usare il link di prenotazione e scrivono per farsi fissare l'appuntamento.",
      'Il tempo speso a rincorrere messaggi è tempo tolto ai pazienti, alla formazione e ai social.',
    ],
    reminder:
      'Promemoria della visita del giorno dopo; richiamo per il controllo periodico (per esempio dopo quattro settimane) per rivedere il piano.',
    followUp:
      'Chi ha chiesto informazioni sulla prima visita e non ha prenotato, o chi ha saltato il controllo.',
    care: 'Mai promettere risultati o chili persi. Il paziente spesso ha 50-60 anni e vuole sentirsi seguito da una persona: tono caldo e semplice.',
  },
  {
    sector: 'Agenzia immobiliare, agente immobiliare, costruttore',
    matches: [/\b(?:immobiliar|agente immobiliare|real estate|impresa edile|costruttor)/u],
    pains: [
      'Anni di contatti accumulati in rubrica e nel gestionale immobiliare che nessuno ricontatta quando esce un immobile adatto.',
      'Le chiamate perse durante le visite e i sopralluoghi: chi chiama per un annuncio vuole una risposta subito.',
      'Bisogna capire in fretta se chi scrive compra, vende o affitta, con che budget e in che zona, prima di dedicargli tempo.',
      'Poca dimestichezza con la tecnologia: serve qualcosa che funzioni da solo e un team che lo segua.',
    ],
    reminder:
      "Promemoria della visita all'immobile con indirizzo e orario; avviso ai contatti in rubrica quando apre un nuovo cantiere o un immobile adatto alla loro ricerca.",
    followUp: 'Chi ha chiesto informazioni su un annuncio e non ha fissato la visita.',
    care: null,
  },
  {
    sector: 'Dentista, studio medico, poliambulatorio, psicologo, veterinario',
    matches: [
      /\b(?:dentist|odontoiatr|studio medico|medico|poliambulator|ambulatori|psicolog|psicoterap|veterinar|ottic|logoped|ostetric|podolog)/u,
    ],
    pains: [
      'Il telefono squilla mentre si è con un paziente: chi non trova risposta chiama lo studio successivo.',
      'Gli appuntamenti saltati senza avvisare lasciano buchi in agenda che non si riempiono più.',
      'La segreteria passa ore a fare promemoria e richiami a mano.',
    ],
    reminder:
      "Promemoria dell'appuntamento del giorno dopo con conferma; richiamo per il controllo periodico (igiene ogni sei mesi, vaccino, visita di controllo).",
    followUp: 'Chi ha chiesto un preventivo o una prima visita e non ha prenotato.',
    care: 'È sanità: tono rassicurante, mai pressante, nessun consiglio medico nei messaggi automatici.',
  },
  {
    sector: 'Parrucchiere, barbiere, centro estetico, spa, palestra, personal trainer',
    matches: [
      /\b(?:parrucch|barbier|barber|estetist|centro estetico|beauty|nail|palestr|fitness|personal trainer|pilates|yoga)/u,
      /\b(?:spa|day spa)\b/u,
    ],
    pains: [
      'Con le mani occupate non si può rispondere a WhatsApp e al telefono: i messaggi si accumulano fino a sera.',
      'Gli appuntamenti dimenticati lasciano poltrone e lettini vuoti.',
      'I clienti abituali spariscono senza che nessuno se ne accorga e li ricontatti.',
    ],
    reminder:
      "Promemoria dell'appuntamento del giorno dopo; richiamo dopo qualche settimana per il prossimo taglio, trattamento o rinnovo dell'abbonamento.",
    followUp:
      "Il cliente abituale che non torna da un po', o chi ha chiesto informazioni e non ha prenotato.",
    care: null,
  },
];

/**
 * What every business on the calls shared, whatever the sector. Used on their own when no
 * sector fits, and alongside the sector's when one does.
 */
const COMMON_PAIN_POINTS = [
  "Chi scrive o chiama mentre si lavora non trova risposta e va dalla concorrenza: ogni contatto perso è una vendita persa, moltiplicata per tutto l'anno.",
  'WhatsApp, telefono, email e social sono sparsi: nessuno ha la visione di chi ha scritto, cosa vuole e a che punto è.',
  'Promemoria, richiami e risposte sempre uguali si scrivono a mano, uno per uno, e qualcuno viene dimenticato.',
  'Chi fa tutto da solo lavora anche la sera e la domenica per stare dietro ai messaggi.',
  "Il ritmo e il tono delle automazioni li decide l'attività: niente messaggi aggressivi, il lato umano resta.",
];

/**
 * Picks the sector a business belongs to from its category and name.
 * @param options What is known.
 * @param options.category The Google Maps category, if any.
 * @param options.categories The other categories.
 * @param options.company The business name.
 * @returns The sector's pain points, or null when none fits.
 */
export const findSectorPainPoints = (options: {
  category: string | null;
  categories: string[];
  company: string;
}) => {
  // The category says more than the name: a "Studio Rossi" could be anything
  const sources = [options.category, ...options.categories, options.company]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  for (const source of sources) {
    const sector = SECTOR_PAIN_POINTS.find((entry) =>
      entry.matches.some((match) => match.test(source)),
    );

    if (sector) {
      return sector;
    }
  }

  return null;
};

/**
 * Renders one sector of the playbook.
 * @param entry The sector.
 * @returns The sector, as Markdown.
 */
const renderSector = (entry: SectorPainPoints) =>
  [
    `### ${entry.sector}`,
    ...entry.pains.map((pain) => `- ${pain}`),
    `- Promemoria tipico: ${entry.reminder}`,
    `- Chi rincorrere: ${entry.followUp}`,
    ...(entry.care ? [`- Attenzione: ${entry.care}`] : []),
  ].join('\n');

/**
 * Renders the pain points the version B writer reads: the sector's when one fits, the
 * other sectors as examples so the AI can still find the right angle, and the common ones.
 * @param sector The sector found for the business, if any.
 * @returns The playbook, as Markdown.
 */
export const renderPainPlaybook = (sector: SectorPainPoints | null) => {
  const others = SECTOR_PAIN_POINTS.filter((entry) => entry !== sector);

  return [
    sector
      ? `## Il settore di questa attività\n${renderSector(sector)}`
      : '## Il settore di questa attività\nNessun settore sotto corrisponde con certezza: deducilo dalle fonti e prendi spunto dal più vicino.',
    `## Cosa dicono tutti\n${COMMON_PAIN_POINTS.map((pain) => `- ${pain}`).join('\n')}`,
    `## Altri settori, come esempio\n${others.map(renderSector).join('\n\n')}`,
  ].join('\n\n');
};
