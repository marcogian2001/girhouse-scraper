# Automazione risposte cold email: stato dei lavori

Ultimo aggiornamento: 18 ottobre 2026 (rifacimento della demo come tour guidato).

Questo file serve a riprendere il lavoro anche senza la chat originale, da soli o con un altro assistente AI. Per ripartire basta dire all'AI: "leggi `docs/AUTOMAZIONE_RISPOSTE.md` e `AGENTS.md`, poi continuiamo dalla prima voce non spuntata".

Legenda: `[x]` fatto, `[ ]` da fare, `[?]` da verificare.

---

## 1. Obiettivo

Automatizzare tutto quello che succede dopo la risposta di un lead a una cold email Instantly e prima della call col venditore:

1. **Classificazione.** L'AI legge la risposta e la classifica.
2. **Risposta.** Scrive la risposta nello stesso thread Instantly.
3. **Demo.** Manda una pagina personalizzata con la giraffa Girhouse.
4. **Follow-up.** Fa i follow-up in base a cosa il lead ha visto della demo.
5. **WhatsApp.** Passa a WhatsApp tramite Go High Level (GHL).
6. **Prenotazione.** Porta il lead a prenotare la call, proponendo due orari presi dal calendario GHL, non un link al calendario.

### L'offerta

È la fonte di verità per tutti i testi. È configurabile in **Dashboard → Automazione** e non è mai scritta a mano nei prompt.

- **Cosa facciamo:** rifacciamo la landing page e configuriamo GHL: telefono, WhatsApp ed email in un unico posto, risposta automatica e follow-up. Numeri e account restano del cliente.
- **Prezzo:** 97€/mese, zero attivazione, nessun vincolo, assistenza italiana inclusa.
- **Prova:** prima settimana gratis, senza carta né contratto.
- **Scarcity reale:**
  - 10 nuove attività al mese, una cifra fissa e non un conteggio dei posti rimasti;
  - 15 giorni dopo la prima email il prezzo sale a 197€.

### Regole di scrittura

- Italiano, tono umano tra titolari, niente marketing.
- 3-6 righe, una sola call to action.
- Niente trattini lunghi.
- Mai dati, risultati o scadenze inventati.

---

## 2. Decisioni prese con il titolare

| Tema | Decisione |
|---|---|
| Recensioni e foto | Lette on demand da Google Places e **mai salvate** (lo vietano i termini di Google), con cache di 24h |
| Dominio della demo | Percorso sul dominio principale: `{NEXT_PUBLIC_APP_URL}/it/demo/{slug}`. Il sottodominio `demo.girhouse.com` è rimandato |
| Scarcity | Cifra fissa, "prendiamo solo 10 nuove attività al mese" |
| Nurturing per `non_ora` | Fino a 3 richiami, uno ogni 30 giorni, poi chiuso. Il testo della risposta segue la regola attuale (offerta spiegata meglio più scarcity) |
| `non_interessato` | Una sola email di rilancio, come da brief. Al secondo no la conversazione si chiude |
| `stop` / "cancellatemi" | **Nessuna risposta**: blocklist Instantly e soppressione permanente nel DB, immediate anche in modalità bozza |
| Obiezione nuova | La risposta va **sempre** in revisione manuale, anche in modalità automatica |
| Stop corretto a mano | Lo stop resta permanente anche se si cambia la categoria |
| Kill switch spento | Nessun invio; ricezione, classificazione e stop continuano |
| WhatsApp aziendale | `+393516930869`, da inserire nel campo di Automazione |
| Nomi degli stati | Inglesi nel DB, etichette italiane in dashboard |

---

## 3. Azioni manuali, a carico del titolare

- [ ] **Riavviare `bun run dev`.** Applica le migrazioni dalla `0015` alla `0018` su **Neon**: aggiungono solo tabelle e colonne, senza toccare i dati esistenti.
- [ ] **Inserire il numero WhatsApp aziendale** `+393516930869` in **Dashboard → Automazione**.
- [?] **Caricare le 9 obiezioni** da `docs/obiezioni.json` (vedi la sezione 6). Va fatto a mano o con uno script lanciato dal titolare, perché l'AI non ha il permesso di scrivere su Neon.
- [ ] **Commit del lavoro.** Niente è ancora committato: circa 90 file modificati o nuovi sul branch `main`.
  - Attenzione: in `src/components/ui/input.tsx`, `ui/select.tsx`, `ui/textarea.tsx` e `src/components/KnowledgeMentionTextarea.tsx` c'è una modifica `bg-white` **non fatta dall'AI**. Decidi tu se includerla.
- [ ] **Variabili d'ambiente su Vercel:**
  - `INSTANTLY_WEBHOOK_SECRET`, lo stesso valore del `.env` locale;
  - `NEXT_PUBLIC_APP_URL`, il dominio vero: da qui nasce il link della demo.
- [ ] **Deploy.** Le migrazioni partono da sole con `npm run build`.
- [ ] **Webhook su Instantly** per gli eventi `reply_received` e `auto_reply_received`, con URL `https://<dominio>/api/webhooks/instantly?secret=<INSTANTLY_WEBHOOK_SECRET>`. Il testo pronto è nella pagina Automazione.
- [ ] **Qualche giorno in modalità bozza** con risposte vere, poi passare ad **automatica**.
- [ ] **Per la fase 4**, mettere nel `.env` (non in chat): token GHL (private integration), location id, calendar id, pipeline id e stage id.

---

## 4. Avanzamento per fase

### Fase 1: ricezione, classificazione, revisione [x]

- [x] Webhook `POST /api/webhooks/instantly`:
  - segreto in query o header, confronto timing-safe;
  - deduplica con un hash del payload, perché Instantly non manda l'id dell'email.
- [x] Job `reply_process`:
  - legge il thread da Instantly e lo salva come snapshot sul messaggio;
  - se trova una risposta manuale del venditore, mette la conversazione in `paused`;
  - applica la guardia stop deterministica (regex);
  - classifica con Claude, usando lo schema JSON del brief più `orario_scelto` e `data_rientro`;
  - decide lo stato successivo.
- [x] Obiezioni nuove create automaticamente come "da revisionare", con un angolo proposto dall'AI.
- [x] Dashboard:
  - **Risposte**, con il tab "Da revisionare";
  - **dettaglio conversazione**, con thread, classificazione, correzione della categoria e log con chi ha agito;
  - **Obiezioni**;
  - **Automazione**, con kill switch, modalità, soglie, offerta e modelli.
- [x] Simulazione di risposte (`/dashboard/replies/new`), che non chiama mai Instantly né GHL.
- [x] Le email in stop sono escluse dagli export CSV delle ricerche lead.

### Fase 2: risposte e invio [x]

- [x] Job `reply_write`: Claude scrive la risposta per categoria (interessato, domanda, obiezione, non_ora, non_interessato, persona_sbagliata con referente).
- [x] Controlli automatici:
  - niente trattini lunghi;
  - lunghezza;
  - link non ammessi;
  - prezzi diversi da quelli in configurazione.
  - Se un controllo fallisce l'AI riscrive una volta, poi la risposta resta in bozza.
- [x] Modalità **bozza**: approvi, modifichi o scarti dalla dashboard.
- [x] Modalità **automatica**: parte da sola solo con classificazione sicura e nessun problema rilevato.
- [x] Invio (job `reply_send`) con ritardo casuale di 4-15 minuti, solo in orario lavorativo italiano (lun-ven 9-18, festivi e Pasquetta esclusi).
  - Prima di partire ricontrolla kill switch, stop e nuove risposte del lead.
- [x] Invio nello stesso thread e dalla stessa casella, via `POST /emails/reply` di Instantly.
- [x] Campagne nuove create con `stop_on_auto_reply: false`.
- [x] L'angolo dell'obiezione ha la precedenza sulla call to action: se dice di non proporre nulla, l'AI non propone nulla.
- [ ] **Persona sbagliata con referente:** la bozza di ringraziamento c'è; manca la creazione automatica del nuovo contatto in campagna.
- [ ] **Fuori ufficio sulle campagne vecchie:** manca la ripresa alla data di rientro. Va fatta nella fase 5.

### Fase 3: demo personalizzata [x]

- [x] Pagina pubblica `/it/demo/{slug}`:
  - slug non indovinabile (circa 59 bit);
  - `noindex`;
  - tema chiaro fisso;
  - la giraffa in `public/demo/`.
- [x] Sei passi guidati dalla giraffa:
  1. landing dell'attività (logo o iniziali, colori, servizi, recensioni Google vere, orari, contatti);
  2. WhatsApp automatico in 30 secondi;
  3. inbox unica;
  4. follow-up;
  5. offerta e scarcity;
  6. numero WhatsApp e link "scrivimi".
- [x] Costruzione della demo, una volta per conversazione:
  - dati del lead;
  - sito (logo, `theme-color`, testo);
  - testi dell'AI scritti solo dai fatti disponibili, con la sezione servizi che sparisce se il sito non li elenca.
- [x] Foto Google servite tramite proxy (`/api/demo/{slug}/photo/{n}`), così la chiave API non arriva mai al browser.
- [x] Tracking:
  - apertura, passi visti, battito ogni 15s, click su WhatsApp, numero lasciato;
  - con `?anteprima=1` niente tracking;
  - la conversazione passa da `demo_sent` a `demo_viewed`.
- [x] La bozza per un lead "interessato" contiene il link vero alla demo.
- [x] Riquadro **Demo** nel dettaglio conversazione: stato, passo raggiunto, tempo sulla pagina, pulsante "Genera demo".
- [x] Simulando con l'email di un lead vero, la conversazione di test usa i dati veri di quel lead.
- [?] **Verifica visiva della pagina nel browser**, non ancora fatta dall'AI. Prova: simula "mi interessa" con `michienzistudio@gmail.com`, poi "Apri anteprima".
- [ ] **Colore dalle foto Maps:** non fatto, perché richiede la dipendenza `sharp` e l'installazione è fallita. Oggi il colore viene dal `theme-color` del sito, altrimenti è il blu della giacca della giraffa.

### Fase 3b: demo come tour guidato [x] (rifacimento del 18/10, su richiesta del titolare)

- [x] Tour guidato con una cosa alla volta, il pulsante "Avanti"/"Indietro", la barra di avanzamento e `?passo=N` per aprire uno step preciso. Il componente è `src/components/demo/DemoTour.tsx` e le scene sono in `TourScenes.ts`.
- [x] La giraffa "parla": testo a macchina da scrivere con la giraffa animata (`GiraffeSpeaker.tsx`). Niente voce.
- [x] **Step 1:** landing completa, rivelata sezione per sezione: hero, servizi, chi siamo, recensioni in stile Google, sistema recensioni e contatti.
- [x] **Step 2:** iPhone con una chat WhatsApp fedele all'originale. Il copione è generato dall'AI per ogni attività: il bot risponde in 30 secondi, propone due orari, il cliente prenota.
- [x] **Step 3:** gestionale con lo stesso cliente della chat: scheda, tag, timeline, pipeline e inbox unica.
- [x] **Step 4:** automazione stile workflow builder, con i nodi che si accendono e un log live.
- [x] **Step 5:** prezzo con il 197€ barrato, conto alla rovescia vero fino all'aumento, cosa include e garanzie.
- [x] **Step 6:** numero WhatsApp, poi due orari consigliati più "vedi altri orari", conferma e prenotazione su GHL (`src/libs/DemoBooking.ts`).
- [x] Snapshot v2 (landing più chat). Le demo vecchie si ricostruiscono da sole alla prima apertura, mantenendo il link.
- [x] Sistema recensioni con il filtro 4-5 stelle, scelto dal titolare. ⚠️ Google vieta il "review gating".
- [ ] **Token GHL** nel `.env`: `GHL_API_TOKEN` (private integration della location Girhouse con permessi calendars.readonly, calendars/events.write e contacts.write), `GHL_LOCATION_ID=bupvNmqh3Ng9opZrbF48`, `GHL_CALENDAR_ID=V8lrPKIjN2AJ5RxHrOYN` ("Call Demo - 30 min"). Senza token lo step 6 mostra solo il link WhatsApp.
- [?] **Verifica visiva** del tour nel browser, su desktop e su mobile.
- [ ] Facoltativo: altre pose della giraffa (che indica, che saluta, che festeggia).

### Fase 3c: rifiniture del tour [x] (18/10, su richiesta del titolare)

- [x] La giraffa si chiama **Gigi di Girhouse**. Le battute (`DemoPage.line_*`) usano `<b>` per il grassetto e `<hl>` per l'evidenziatore (`src/components/demo/Highlights.ts`).
- [x] **Schermata iniziale con video** (`GigiVideoScene.tsx`): `public/demo/gigi-intro.mp4` (10,1 s, 0,7 MB, voce accelerata del 15% e sfondo portato a bianco puro), con poster `.jpg` e sottotitoli `.vtt` nascosti (servono solo per accessibilità). Si rigenera con `bun scripts/generate-gigi-video.ts intro`: voce Gemini TTS "Achird" (ElevenLabs su Kie dava "Internal Error"), poi avatar Kling e compressione con ffmpeg; costa circa 0,60$. Va rilanciato ogni volta che cambia `line_intro` in `it.json`. Gli upload di Kie stanno su `kieai.redpandaai.co`, non su `api.kie.ai` come dicono i docs. Se il video manca, resta l'immagine animata.
- [x] Dopo l'intro Gigi sta in basso a destra con un pop-up, e il contenuto occupa tutto lo schermo.
- [x] "Avanti" mentre Gigi scrive: il primo tocco completa la frase, il secondo passa avanti (`nextTapAction`).
- [x] **Step 1:** le stelle del sistema recensioni si possono toccare. 4-5★ portano a Google, 1-3★ a un feedback privato.
- [x] **Step 2:** chat più empatica (snapshot v3). Prima "mi dispiace…", poi gli orari, più la nota per il gestionale (`chat.note`).
- [x] **Step 3:** timeline classica; pipeline con il cursore che trascina la card di Giulia e apre la nota; inbox come una chat vera (chiamata persa, WhatsApp, email) con il compositore.
- [x] **Step 4:** al posto del log, un'animazione per ogni azione.
- [x] **Step 5:** "Prezzo riservato a **{attività}**", la settimana gratis visibile subito, l'assistenza in un gruppo WhatsApp e le garanzie in una fascia unica.
- [x] **Step 6:** prefisso con le bandiere (Italia di default), il logo WhatsApp vero, l'avviso "una sola call, non riprogrammabile" e i pulsanti per aggiungere l'evento al calendario (Google o `.ics`).
- [ ] Gigi in 3D: rimandato.

### Fase 3d: rifiniture del 19/10 [x]

- [x] **Prima schermata:** headline "Anteprima della piattaforma Girhouse realizzata per {attività}", più la scritta Girhouse (`GirhouseWordmark.tsx`).
- [x] **Logo ufficiale:** `public/Black.png` e `public/White.png`, mostrati da `GirhouseLogo.tsx`.
  - Nero in alto nella prima schermata e nella barra in alto del tour; bianco nella sezione prezzo.
- [x] **Barra in alto:** "Passo X di 6", "Girhouse × {attività}" e la barra di avanzamento.
- [x] **Barra di Gigi in basso:** a tutta larghezza, con Gigi a sinistra del testo.
  - La sua altezza reale finisce in `--demo-bar-h`, così i contenuti non ci vanno mai sotto.
- [x] **Scroll automatico** (`ScrollAnchor.tsx`):
  - la pipeline segue la card in orizzontale;
  - le automazioni seguono il nodo attivo, e su mobile l'animazione sta sopra;
  - il prezzo scorre fino alla parte appena comparsa.
- [x] **Foto più veloci:**
  - la route `photo/[index]` risponde 302 verso la CDN di Google (`skipHttpRedirect`), 1600px per la prima foto e 1000px per le altre;
  - la schermata iniziale le precarica.
- [x] **Video prima del prezzo:** `public/demo/gigi-pricing.mp4` (`DemoPage.line_pricing_video`), scena `video` allo step 5, con sotto il conto alla rovescia vero.
  - Il video non dice il prezzo: lo si scopre premendo "Scopri il prezzo". Il titolo della scena è "Quanto costa tutto questo?".
  - Si rigenera con `bun scripts/generate-gigi-video.ts pricing --slots=10`, e **va rigenerato se cambiano i posti al mese** in Automazione.
- [x] **Sezione prezzo in stile volantino**, nei colori Girhouse:
  - headline "Offerta riservata", pillola con il nome dell'attività, Gigi con il pacchetto, card del prezzo e garanzie in basso;
  - la grafica è `public/demo/pricing-package.png`, fatta da `bun scripts/generate-pricing-art.ts` (Nano Banana Edit più rimozione dello sfondo, su Kie).
- [x] **"Conferma la call" su mobile:** più grande e con l'icona; prima era sottile per via di `flex-1` in colonna.
- [x] **Sezione prezzo, seconda revisione:**
  - pagina tutta blu, senza riquadro e senza le battute di Gigi (restano solo Indietro/Avanti, in bianco);
  - logo bianco piccolo al centro e tutto più compatto, così su mobile si vede fino al conto alla rovescia;
  - € senza sfondo, solo "Prima settimana gratis", niente pulsante "Prenota la call".
- [x] **Call fissata:**
  - un solo pulsante grande "Aggiungi a Google Calendar" (tolto il file `.ics`);
  - il testo dice che un consulente contatta in giornata per confermare.
- [x] **Altro:**
  - tolta l'icona messaggio dal risultato 1-3★;
  - la timeline scorre da sola verso il basso;
  - corretto un overflow orizzontale su mobile;
  - i download da Kie riprovano da soli se il file server cade.

### Fase 4: GHL, calendario, prenotazione [x] (20/10)

- [x] **Client GHL** (`src/services/GoHighLevel.ts`): slot liberi, durata della call, contatto (upsert e ricerca per email), appuntamento, DND, opportunità.
- [x] **Le email ai lead interessati propongono due orari veri** dal calendario, dopo il link alla demo.
  - L'AI scrive solo il segnaposto `{{orari}}`; la piattaforma lo sostituisce con "giovedì 22 ottobre alle 9:00 oppure venerdì 23 ottobre alle 13:00". Un orario non è mai inventato.
  - Gli orari offerti restano sull'email (`outbound_email.offered_slots`, migrazione 0019).
- [x] **Prenotazione da email:**
  - il classificatore legge gli orari offerti e restituisce `orario_scelto` come `YYYY-MM-DDTHH:mm` (capisce "il primo", "giovedì alle 10");
  - se l'orario è libero si prenota su GHL (contatto, appuntamento, opportunità) e si scrive l'email di conferma (`kind = booking_confirmation`), che segue la modalità di Automazione;
  - se l'orario è preso, l'email propone due orari nuovi.
  - Il cuore della prenotazione è condiviso con la demo: `bookCall` in `src/libs/DemoBooking.ts`.
- [x] **Opportunità** nella pipeline "4. Cold Email | Instantly", fase "Trial Schedulata", solo quando la call è prenotata.
  - Se esiste già un'opportunità del contatto in quella pipeline viene spostata, altrimenti creata (`/opportunities/upsert`).
  - Se GHL la rifiuta, la prenotazione resta valida e nel log compare "Opportunità GHL non salvata".
- [x] **Webhook `POST /api/webhooks/ghl?secret=…`** (`src/libs/GhlEvents.ts`):
  - `appointment_booked`: stato `call_booked` e annullo degli invii;
  - `handover`: `manual_review`;
  - `dnd`: stop completo.
  - Trova la conversazione per contatto GHL, altrimenti per email. Ricevere due volte lo stesso evento non cambia nulla.
- [x] **Lo stop applica anche il DND su GHL**, se il contatto esiste.
- [x] **Variabili in `.env`:** `GHL_PIPELINE_ID`, `GHL_PIPELINE_STAGE_ID` e `GHL_WEBHOOK_SECRET` (generato il 20/10).
- [x] **Verifica su PGlite**, con il lead Michienzi: offerta degli orari, scelta "il primo", prenotazione, conferma, webhook (prenotazione, doppione, handover).
- [ ] **Token GHL:** la private integration deve avere anche `opportunities.write` e `contacts.write`. Lettura verificata il 20/10; la scrittura si vede alla prima prenotazione vera.
- [ ] **Workflow GHL da creare (titolare).** Per ognuno, un'azione "Webhook" con URL `https://<dominio>/api/webhooks/ghl?secret=<GHL_WEBHOOK_SECRET>`, metodo POST e Custom Data `event` (più `start_time` per la prenotazione):
  1. trigger "Appointment Status" (booked) sul calendario "Call Demo - 30 min": `event = appointment_booked`, `start_time = {{appointment.start_time}}`;
  2. trigger "Contact DND" (attivato): `event = dnd`;
  3. trigger usato da Conversation AI per passare a una persona (per esempio un tag `handover`): `event = handover`.
- [ ] **Notifica al venditore:** workflow GHL con trigger "Opportunity Stage Changed" → "Trial Schedulata", che manda una notifica interna o un SMS al venditore.
- [ ] **Su Vercel:** `GHL_PIPELINE_ID`, `GHL_PIPELINE_STAGE_ID`, `GHL_WEBHOOK_SECRET` (più quelle GHL già usate).

### Fase 5: follow-up in base al comportamento [x] (20/10)

- [x] **Decisione pura** `nextAction` in `src/utils/FollowUps.ts`, con test, basata su `summarizeDemo`. Si applica solo a chi ha ricevuto la demo e non ha prenotato.
  - Ogni 2 giorni lavorativi (campo "Giorni lavorativi tra un follow-up e l'altro" in Automazione), fino a 3 follow-up:
    - demo non aperta: "ti è arrivata?" con di nuovo il link;
    - vista a metà: link a `?passo=N`, il primo passo non visto, più l'offerta di spiegarla al telefono;
    - vista tutta: "cosa ti ha frenato?", senza link.
  - Poi **chiusura** con la scarcity vera e due orari liberi.
  - Dopo altri 2 giorni lavorativi:
    - "In attesa di WhatsApp (fase 6)" per chi aveva detto sì, ha ricevuto la demo, non ha prenotato e ha un cellulare;
    - per gli altri, stato `closed_no_reply` ("Chiuso, senza risposta").
- [x] **Nurturing "non ora":** un'email ogni 30 giorni, al massimo 3 volte, poi `closed_no_reply`.
- [x] **Pianificazione:** `conversation.nextActionAt` più un job `conversation_tick` con `runAfter` (`src/libs/NextAction.ts`, `src/libs/FollowUps.ts`), senza un nuovo cron.
  - Un job che arriva dopo che l'orario è stato spostato non fa nulla.
  - Il prossimo passo si fissa solo quando un'email esce davvero: in modalità bozza aspetta la tua approvazione.
- [x] **Interruzioni:** una risposta del lead, una prenotazione o uno stop azzerano il prossimo passo; i follow-up in bozza o programmati vengono annullati.
  - Se il lead scrive dopo una chiusura, la conversazione riparte dalla classificazione.
- [x] **Invio:** i follow-up rispondono all'ultima email del lead nel thread Instantly, dalla stessa casella.
- [x] **Dashboard:**
  - nel dettaglio conversazione: prossimo follow-up, follow-up inviati e nurturing inviati;
  - solo sulle conversazioni di test: "Esegui ora il prossimo passo (test)".
- [x] **Migrazione 0020:** stato `closed_no_reply`, job `conversation_tick`.
- [x] **Verifica su PGlite** con il lead Michienzi: l'intera sequenza (non aperta, a metà con `?passo=4`, completa, chiusura con orari, chiusura senza risposta), la risposta a metà sequenza e il nurturing.
- [ ] Ripresa dopo il fuori ufficio alla data di rientro (`outOfOfficeUntil`).
- [ ] Opzione "chiude la conversazione" sull'obiezione (per esempio "Tono non adatto").
- [ ] Prenotazioni dei setter per lead che non hanno mai risposto: oggi restano nella sequenza Instantly (gap discusso il 20/10).

### Fase 6: WhatsApp via GHL [ ]

- [ ] Parte solo se il lead aveva risposto positivamente, c'è un cellulare italiano valido (`isItalianMobile` in `src/utils/Phone.ts`) e non risponde alle email da 2 giorni lavorativi.
- [ ] L'AI scrive `sintesi_email`, `obiezioni_emerse` e il primo messaggio, senza link.
- [ ] `upsertContact` con i campi custom `nome_attivita`, `citta`, `servizi`, `link_demo`, `sintesi_email`, `obiezioni_emerse`, `comportamento_demo` e `wa_primo_messaggio`, più il tag `wa-outreach`.
- [ ] Webhook GHL per i messaggi in entrata, salvati in sola lettura in una tabella `whatsapp_message`. La piattaforma non risponde mai su WhatsApp.
- [ ] Checklist per il titolare: workflow GHL "WA Outreach", Drip Mode di GoGHL, invii solo in orario lavorativo.

### Fase 7: dashboard metriche [ ]

- [ ] `/dashboard/replies/stats` con:
  - risposte per categoria;
  - demo aperte e demo viste fino alla fine;
  - call prenotate;
  - tassi per categoria e per obiezione.

---

## 5. Punti da verificare

- [?] **Blocklist Instantly:** endpoint `POST /block-lists-entries` con `bl_value`, preso dalla documentazione e non ancora provato su un lead vero.
- [?] **Etichette di interesse Instantly:** la mappatura dei valori numerici `i_status` (in `src/services/Instantly.ts`) è dedotta.
- [?] **`stop_on_auto_reply`:** il campo esiste nella v2 delle campagne Instantly? Da controllare alla prima campagna nuova.
- [?] **Instantly lento:** se una risposta non è ancora visibile nell'API quando arriva il webhook, il job ritenta 5 volte e poi la manda in revisione.
- [?] **Tono delle prime bozze vere:** rileggerle prima di passare ad automatica.

---

## 6. Libreria obiezioni

Le 9 obiezioni dal file del titolare sono in [`docs/obiezioni.json`](obiezioni.json), con titolo, descrizione, esempi e angolo di risposta:
1. Ho già la segretaria
2. Ho già un gestionale o un sistema
3. Ho già chi mi segue
4. Rispondo già subito
5. Ho poche richieste
6. Non ho budget
7. Non ho ricevuto la prima email
8. Non ho capito cosa offrite
9. Tono non adatto

Non sono state caricate come obiezioni, perché hanno già una loro regola di categoria:
- "Non mi interessa": `non_interessato`;
- "Non ora": `non_ora`;
- "Cancellatemi": `stop`. Le frasi vere di questa riga sono state aggiunte alla guardia stop.

Per caricarle ci sono due strade:
- **A mano:** da **Dashboard → Obiezioni → Nuova obiezione** (titolo, descrizione, esempi uno per riga, come rispondere), nell'organizzazione "Gianmarco Scandale";
- **Con uno script:** si chiede all'AI di generarne uno che legga `docs/obiezioni.json` e chiami `createObjection` (`src/libs/Objections.ts`) per l'organizzazione `aed53bff-a9be-44ca-b22e-986cfaafdee0`, con `status: 'active'`. Poi lo lancia il titolare, perché scrive su Neon.

---

## 7. Mappa del codice

| Area | File |
|---|---|
| Schema DB | `src/models/Schema.ts`, sezione "Reply automation", e le migrazioni `0015_reply_automation`, `0016_outbound_email`, `0017_demo` |
| Webhook e ricezione | `src/app/api/webhooks/instantly/route.ts`, `src/libs/Conversations.ts` |
| Classificazione | `src/libs/ReplyJobs.ts`, `src/services/ReplyClassifier.ts`, `src/utils/StopGuard.ts`, `src/utils/ReplyRouting.ts` |
| Scrittura e invio | `src/libs/OutboundEmails.ts`, `src/services/ReplyWriter.ts`, `src/utils/ReplyGuard.ts`, `src/utils/BusinessHours.ts` |
| Prompt condivisi | `src/services/ReplyPrompt.ts`, `src/utils/Offer.ts` |
| Demo | `src/libs/Demos.ts`, `src/services/DemoWriter.ts`, `src/services/WebsiteBrand.ts`, `src/services/GooglePlaces.ts`, `src/app/[locale]/(demo)/demo/[slug]/page.tsx`, `src/components/demo/*`, `src/app/api/demo/[slug]/*` |
| Instantly | `src/services/Instantly.ts`: thread, risposta, blocklist |
| Impostazioni e obiezioni | `src/libs/AutomationSettings.ts`, `src/libs/Objections.ts`, `src/validations/AutomationValidation.ts` |
| Dashboard | `src/app/[locale]/dashboard/{replies,objections,automation}/` |
| Worker | `src/libs/JobWorker.ts`, con i job `reply_process`, `reply_write` e `reply_send` |
| Test | `*.test.ts` accanto al codice, `tests/integration/ReplyAutomationApi.integ.ts` |

---

## 8. Insidie note: leggere prima di toccare qualcosa

- **Il DB di sviluppo è Neon, cioè quello vero.** `bun run dev`, `db:migrate` e `bun run test:e2e` applicano le migrazioni su Neon. Per le prove usare un PGlite usa e getta:
  - avviarlo su una porta libera con `TZ=UTC npx pglite-server -p 54999 --run <script>`;
  - passare `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54999/postgres` esplicito.
- **`TZ=UTC` è obbligatorio con PGlite.** Senza, il fuso di sessione è `Etc/GMT-4` e i job sembrano nel futuro, quindi il worker non li prende.
- **La porta 5432 è occupata** da un Postgres di Homebrew. Per questo `db-server:file` e `db-server:memory` usano la porta 6543.
- **Next 16 rifiuta un secondo `next dev`** nella stessa cartella. Per le prove senza server si usa Bun, importando le librerie direttamente da uno script fuori dal progetto, con `--env-file` che punta a PGlite.
- **Cache dei tipi:** se `bun run check:types` dà errori su chiavi i18n appena aggiunte, cancellare `tsconfig.tsbuildinfo` (cache vecchia di TypeScript 7).
- **Formatter:** lanciare `bunx oxfmt` solo sui file modificati, mai su tutta `src`.
- **`npm install` può essere ucciso** per memoria e lasciare `node_modules` rotto. Rimedio: `npm ci --prefer-offline`.
- **Comandi ammessi da `AGENTS.md`:** `bun run build-local`, `lint`, `check:types`, `check:deps`, `check:i18n`, `test` e `test:e2e`, con l'avvertenza su `test:e2e` qui sopra.
- **Testi i18n:** ogni testo visibile va in `src/locales/en.json` e `it.json`. Le chiavi dinamiche vanno aggiunte agli ignore di `check:i18n` in `package.json`.

---

## 9. Come provare tutto da capo

1. Riavviare `bun run dev`.
2. In **Automazione**:
   - inserire il numero WhatsApp;
   - lasciare la modalità **bozza**.
3. In **Risposte → Simula una risposta**, provare un caso per categoria:
   - "Sì, mi interessa" con `michienzistudio@gmail.com` (lead vero, così la demo ha dati veri);
   - "Quanto costa?";
   - "Ho già la segretaria";
   - "Non ci serve", e poi di nuovo un no con la stessa email;
   - "Non scrivetemi più";
   - "Sono fuori ufficio fino al 30 ottobre";
   - "Non sono il titolare, scrivete a mario@…".
4. In ogni conversazione controllare:
   - classificazione;
   - bozza;
   - riquadro Demo e "Apri anteprima" (la pagina);
   - log.
5. Approvare una bozza: in una conversazione di test l'invio è simulato e non parte nulla davvero.
