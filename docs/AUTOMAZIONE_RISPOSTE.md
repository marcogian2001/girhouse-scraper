# Automazione risposte cold email: stato dei lavori

Ultimo aggiornamento: 29 ottobre 2026 (garanzia soddisfatti o rimborsati a 30 giorni al posto della settimana gratis; demo versione B).

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
- **Garanzia (29/10):** soddisfatti o rimborsati: se dopo 30 giorni il cliente non è soddisfatto, gli rimborsiamo quanto ha pagato. Sostituisce la prima settimana gratis, che non diamo più e non va mai promessa (fino al 29/10 c'era una settimana gratis senza contratto; le email non parlavano mai di carta, decisione del 23/10).
- **Scarcity reale:**
  - 10 nuove attività al mese, una cifra fissa e non un conteggio dei posti rimasti;
  - nella demo il 97€ compare accanto al 197€ barrato, con un conto alla rovescia di 7 giorni da quando la demo viene generata; rigenerarla lo fa ripartire. Finiti i 7 giorni il conto alla rovescia sparisce e il prezzo resta 97€ (decisione del 27/10). Tutto questo compare **solo nella demo**, mai nelle email (decisione del 20/10, sembrava una spinta commerciale).
- **Come si presenta il prezzo nelle email:** quasi un regalo per quello che include, mai una promozione a tempo. Prima si dice tutto quello che include, poi il prezzo.
- **Niente attivazione prima della demo (23/10):** le email non chiedono mai di attivare o provare il sistema; il lead deve prima vedere la demo, quindi ogni pitch porta alla demo. Vale anche sopra l'angolo dell'obiezione.

### Regole di scrittura

- Italiano, tono umano tra titolari, niente marketing.
- 3-6 righe, una sola call to action.
- Niente trattini lunghi.
- Mai dati, risultati o scadenze inventati.
- Ogni email che contiene il link della demo dice che la pagina resta attiva 24 ore, perché tenerla online ha un costo per noi (decisione del 26/10). È l'unica scadenza ammessa nelle email. I follow-up che rimandano il link dicono invece che la pagina è stata riattivata per altre 24 ore. Per ora la scadenza è solo nel testo: le pagine non scadono davvero.

---

## 2. Decisioni prese con il titolare

| Tema | Decisione |
|---|---|
| Recensioni e foto | Lette on demand da Google Places e **mai salvate** (lo vietano i termini di Google), con cache di 24h |
| Dominio della demo | Percorso sul dominio principale: `{NEXT_PUBLIC_APP_URL}/it/demo/{slug}`. Il sottodominio `demo.girhouse.com` è rimandato |
| Scarcity | Cifra fissa, "prendiamo solo 10 nuove attività al mese" |
| Nurturing per `non_ora` | Fino a 3 richiami, uno ogni 30 giorni, poi chiuso. Il testo della risposta segue la regola attuale (offerta spiegata meglio più scarcity) |
| `non_interessato` | Una sola email, cauta e servizievole: ringrazia e rispetta il no, presenta il prezzo come quasi un regalo con cosa include, poi chiede se può mandare la demo già preparata ("se non ti interessa la elimino"). Niente link, scadenze o scarcity. Al secondo no la conversazione si chiude |
| `stop` / "cancellatemi" | **Nessuna risposta**: blocklist Instantly e soppressione permanente nel DB, immediate anche in modalità bozza |
| Obiezione nuova | La risposta va **sempre** in revisione manuale, anche in modalità automatica |
| Stop corretto a mano | Lo stop resta permanente anche se si cambia la categoria |
| Kill switch spento | Nessun invio; ricezione, classificazione e stop continuano |
| WhatsApp aziendale | `+393516930869`, da inserire nel campo di Automazione |
| Nomi degli stati | Inglesi nel DB, etichette italiane in dashboard |

---

## 3. Azioni manuali, a carico del titolare (aggiornate al 20/10)

Tutto il codice è committato su `main`. Restano fuori solo le modifiche `bg-white` del titolare in `src/components/ui/input.tsx`, `ui/select.tsx`, `ui/textarea.tsx` e `src/components/KnowledgeMentionTextarea.tsx`.

**1. Database e deploy**
- [ ] **Riavviare `bun run dev`.** Applica su Neon le migrazioni fino alla `0033`. Aggiungono tabelle e colonne, senza toccare i dati.
- [ ] **Deploy su Vercel.** Le migrazioni partono da sole con la build.

**2. Variabili d'ambiente su Vercel**, gli stessi valori del `.env` locale:
- [ ] `NEXT_PUBLIC_APP_URL`: il dominio vero, da cui nascono i link delle demo.
- [ ] `INSTANTLY_WEBHOOK_SECRET`.
- [ ] `GHL_API_TOKEN`, `GHL_LOCATION_ID`, `GHL_CALENDAR_ID`, `GHL_PIPELINE_ID`, `GHL_PIPELINE_STAGE_ID`, `GHL_WEBHOOK_SECRET`.
- [ ] `GHL_BOT_USER_ID=QO51qnqUW9vkBaEyKdNj`, l'utente "Bot AI" a cui vanno i lead delle campagne gestite dal bot. Senza, l'assegnazione non parte.
- [ ] Controllare che ci siano anche `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_API_KEY`, `INSTANTLY_API_KEY` e `CRON_SECRET` (il cron ogni minuto fa girare risposte, follow-up e WhatsApp).

**3. Instantly**
- [x] **Webhook** per `reply_received` verso `https://<dominio>/api/webhooks/instantly?secret=<INSTANTLY_WEBHOOK_SECRET>`: fatto dal titolare.
  - `auto_reply_received` su Instantly non esiste: le risposte automatiche arrivano con `reply_received` e l'app le riconosce dall'email stessa.
- [ ] **Permessi della chiave API:** anche `leads:update`, che serve a fermare la sequenza dei lead prenotati da un setter.

**4. Go High Level**
- [ ] **Permessi del token:** `calendars.readonly`, `calendars/events.write`, `contacts.write`, `opportunities.readonly`, `opportunities.write`, `locations/customFields.readonly`. `opportunities.readonly` serve a trovare l'opportunità da passare a Bot AI.
- [ ] **Workflow "Go High Level" e "Risposta Positiva"** (partono dai webhook di Instantly e creano o spostano l'opportunità): prima dell'assegnazione aggiungere "Wait 3 minuti" e un If/Else "il contatto ha il tag `bot-ai`":
  - sì: assegna a Bot AI;
  - no: la rotazione di oggi tra i venditori.
- [ ] **Workflow "Trial Schedulata":** se l'opportunità è di Bot AI, riassegnarla a rotazione a un venditore, che fa la call.
- [x] **Campi personalizzati WhatsApp:** creati il 20/10.
- [x] **Workflow "call prenotata"** con webhook `event = appointment_booked`: fatto dal titolare. Va bene anche per le call prenotate dai setter.
- [ ] **Workflow "DND attivato"**: webhook con `event = dnd`.
- [ ] **Workflow "Vendita chiusa"** (per la pagina Test campagne): trigger "Opportunity Status Changed" → stato **Won**; webhook con `event = deal_won` e `value = {{opportunity.monetary_value}}`.
- [ ] **Workflow "No show"** (per la pagina Test campagne): trigger "Appointment Status" → **No Show** sul calendario "Call Demo - 30 min"; webhook con `event = appointment_noshow`.
- [ ] **Workflow "WA Outreach"**:
  - trigger: tag `wa-outreach`;
  - azione: messaggio WhatsApp GoGHL (Drip Mode) con `{{contact.wa_primo_messaggio}}`, solo in orario lavorativo.
- [ ] **Conversation AI su WhatsApp:**
  - usare il prompt della sezione 10;
  - collegare il calendario "Call Demo - 30 min" per prenotare.
- [ ] **Workflow "Risposta WhatsApp"**:
  - trigger "Customer Replied", canale WhatsApp, con il filtro "il contatto ha il tag `wa-outreach`";
  - webhook con `event = whatsapp_inbound` e `message = {{message.body}}`.
- [ ] **Workflow "Handover"**: quando il bot passa a una persona, webhook con `event = handover`.
- [ ] **Notifica al venditore:** trigger "Opportunity Stage Changed" → "Trial Schedulata" nella pipeline "4. Cold Email | Instantly".
- [ ] **Facoltativo:** chiudere il sabato nel calendario "Call Demo - 30 min" se non volete call il sabato. Oggi è aperto.
- Tutti i webhook vanno a `https://<dominio>/api/webhooks/ghl?secret=<GHL_WEBHOOK_SECRET>`, con metodo POST e il campo `event` nei Custom Data.

**5. Dashboard dell'app**
- [ ] **Automazione → Campagne gestite dal bot:** attivare il bot sulle campagne che deve seguire, per esempio "ottico - Roma - #1". Dopo il deploy della migrazione `0026` tutte partono gestite dai venditori.
- [ ] **Automazione:** numero WhatsApp aziendale `+393516930869`.
- [ ] **Obiezioni:** segnare "Dopo la risposta chiude la conversazione" su quelle che devono chiudere, per esempio "Tono non adatto".
- [ ] **Qualche giorno in modalità bozza** con risposte vere, rileggendo le bozze; poi passare ad **automatica**.

**6. Prime prove vere**
- [ ] **Una prenotazione con un lead vero**, non di test, per confermare i permessi GHL in scrittura: contatto, appuntamento, opportunità.
- [ ] **Un referente aggiunto** a una campagna: approvarlo e inviarlo dalla scheda "Invia" della campagna. Il push salta i lead già presenti su Instantly.

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
  - **Risposte**, con ricerca e filtri (vedi "Pagina Risposte e risposte automatiche");
  - **dettaglio conversazione**, con thread, classificazione, correzione della categoria e log con chi ha agito;
  - **Obiezioni**;
  - **Automazione**, con kill switch, modalità, soglie, offerta e modelli.
- [x] ~~Simulazione di risposte~~: tolta il 23/10, sostituita da **Importa risposte**.
- [x] **Importa risposte** (`/dashboard/replies/import`, 23/10), per i vecchi contatti che hanno risposto prima della piattaforma:
  - si inserisce l'email del lead; `importLeadConversation` (`src/libs/Conversations.ts`) legge le sue email su Instantly (`listLeadEmails`) e prende la sua ultima risposta, la stessa che poi legge il job;
  - importa solo se la conversazione è di una campagna creata dalla piattaforma; se il lead ha già una conversazione, apre quella;
  - crea conversazione e `inbound_message` con `event_type = 'imported'`, mette in coda `reply_process` e apre il dettaglio;
  - il job classifica anche se la campagna non è gestita dal bot o se un venditore aveva già risposto a mano; se il lead è interessato genera la demo (`ensureDemo`);
  - **non scrive e non invia nulla**: niente bozza, niente follow-up, niente fuori ufficio, niente referral, niente GHL. Lo stop invece vale come sempre (blocklist e DND).
  - Il link della demo si copia dal riquadro Demo del dettaglio; per chi non è interessato c'è comunque "Genera demo".
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
- [x] **Invio** (job `reply_send`), solo in orario lavorativo italiano (lun-ven 9-18, festivi e Pasquetta esclusi). L'email con la demo parte anche nel weekend e nei festivi, sempre dalle 9 alle 18.
  - Dal 20/10 la risposta parte **15-20 minuti dopo la risposta del lead** (campi in Automazione, default 15 e 20, migrazione 0023).
  - Una bozza approvata più tardi parte subito, o alla prossima apertura se l'ufficio è chiuso.
  - Gli orari nella dashboard sono in ora italiana: prima erano mostrati in UTC.
  - Prima di partire ricontrolla kill switch, stop e nuove risposte del lead.
- [x] Invio nello stesso thread e dalla stessa casella, via `POST /emails/reply` di Instantly.
- [x] Campagne nuove create con `stop_on_auto_reply: false`.
- [x] L'angolo dell'obiezione ha la precedenza sulla call to action: se dice di non proporre nulla, l'AI non propone nulla.
- [x] **Persona sbagliata con referente:** oltre al ringraziamento, l'email del referente diventa un nuovo contatto della stessa campagna (`src/libs/Referrals.ts`).
  - Prende categoria e città di chi ha risposto, e parte la solita pipeline di ricerca e scrittura.
  - Si salta se l'indirizzo è bloccato o è già in campagna.
  - Va approvato e inviato dalla campagna.
- [x] **Fuori ufficio:** ripresa il giorno lavorativo dopo il rientro (vedi fase 5).

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
- [x] **Fonti più ricche (23/10)**, in `src/libs/DemoReferences.ts`:
  - nome: se manca il nome dell'attività si usa quello della persona (ricerca Parallel sul contatto, poi nome e cognome del contatto); l'email solo come ultima risorsa. Una demo con l'indirizzo fatto dall'email, mai aperta, prende un indirizzo nuovo alla rigenerazione;
  - la ricerca sul contatto (`enrichment`) va all'AI: ruolo, settore, come si presenta;
  - **Instagram** via Apify (`apify~instagram-profile-scraper`, circa 0,002 $ a profilo, 15-20 secondi): l'account si trova nei link della ricerca o delle indicazioni; bio e didascalie vanno all'AI, foto profilo e post diventano ritratto e foto. Il link del profilo si legge come pagina di riferimento, mai per logo e colori. A ottobre 2026 l'actor spesso non restituisce i post;
  - le foto di Instagram, del sito e dei link hanno link che scadono o cambiano: si copiano in `demo_image` (migrazione 0031) e si servono da `/api/demo-images/<id>`;
  - **Indicazioni per la demo** nel riquadro Demo: testo libero con link (Instagram, sito, profili, articoli), salvato in `demo.guidance` e riusato alle rigenerazioni. L'AI le tratta come fatti veri; dai link prende testo e foto.
- [x] **Verifica visiva della pagina nel browser**, fatta con Playwright su desktop e mobile.
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
- [x] **Verifica visiva** del tour nel browser, su desktop e su mobile (Playwright).
- [ ] Facoltativo: altre pose della giraffa (che indica, che saluta, che festeggia).
- [x] **Profilo MioDottore** (22/10, su richiesta del titolare: la demo della dott.ssa Todisco era "piatta"). `src/services/MioDottore.ts` legge foto profilo, foto degli studi, voto e recensioni, presentazione, prestazioni con prezzo e sedi. Il profilo si trova dal sito del lead (spesso è proprio MioDottore), da un link nella ricerca Parallel, oppure da `/profilo/nome-cognome` con nome e cognome della ricerca, accettato solo se il cognome coincide e una sede è nella città del lead. Nella landing: ritratto nell'hero e nella barra, prezzi sui servizi, striscia "Lo studio", recensioni MioDottore quando Google non ne ha, tutte le sedi. Un sito MioDottore non dà più logo e colore alla demo. I campi nuovi dello snapshot sono facoltativi, quindi la versione resta 3 e le demo già inviate non si rigenerano da sole: per rifarne una c'è il pulsante "Rigenera demo" nel riquadro Demo della conversazione (`rebuildDemo` in `src/libs/Demos.ts`, mantiene il link).

### Fase 3c: rifiniture del tour [x] (18/10, su richiesta del titolare)

- [x] La giraffa si chiama **Gigi di Girhouse**. Le battute (`DemoPage.line_*`) usano `<b>` per il grassetto e `<hl>` per l'evidenziatore (`src/components/demo/Highlights.ts`).
- [x] **Schermata iniziale con video** (`GigiVideoScene.tsx`): `public/demo/gigi-intro.mp4` (10,1 s, 0,7 MB, voce accelerata del 15% e sfondo portato a bianco puro), con poster `.jpg` e sottotitoli `.vtt` nascosti (servono solo per accessibilità). Si rigenera con `bun scripts/generate-gigi-video.ts intro`: voce Gemini TTS "Achird" (ElevenLabs su Kie dava "Internal Error"), poi avatar Kling e compressione con ffmpeg; costa circa 0,60$. Va rilanciato ogni volta che cambia `line_intro` in `it.json`. Gli upload di Kie stanno su `kieai.redpandaai.co`, non su `api.kie.ai` come dicono i docs. Se il video manca, resta l'immagine animata.
- [x] Dopo l'intro Gigi sta in basso a destra con un pop-up, e il contenuto occupa tutto lo schermo.
- [x] "Avanti" mentre Gigi scrive: il primo tocco completa la frase, il secondo passa avanti (`nextTapAction`).
- [x] **Step 1:** le stelle del sistema recensioni si possono toccare. 4-5★ portano a Google, 1-3★ a un feedback privato.
- [x] **Step 2:** chat più empatica (snapshot v3). Prima "mi dispiace…", poi gli orari, più la nota per il gestionale (`chat.note`).
- [x] **Step 3:** timeline classica; pipeline con il cursore che trascina la card di Giulia e apre la nota; inbox come una chat vera (chiamata persa, WhatsApp, email) con il compositore.
- [x] **Step 4:** al posto del log, un'animazione per ogni azione.
- [x] **Step 5:** "Prezzo riservato a **{attività}**", la garanzia visibile subito (dal 29/10 "soddisfatti o rimborsati", prima la settimana gratis), l'assistenza in un gruppo WhatsApp e le garanzie in una fascia unica.
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
  - € senza sfondo, solo "Soddisfatti o rimborsati: 30 giorni" (fino al 29/10 "Prima settimana gratis"), niente pulsante "Prenota la call".
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
  - Tolto il 23/10: l'email con la demo non propone più la chiamata, perché la propone già la demo alla fine. Gli orari si propongono solo quando il lead ne chiede uno che è già preso, e nella chiusura.
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
  - Ogni giorno lavorativo (campo "Giorni lavorativi tra un follow-up e l'altro" in Automazione), fino a 2 follow-up:
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
  - "Esegui ora il prossimo passo": sulle conversazioni di test sempre, su quelle vere solo in modalità bozza (il passo diventa una bozza da approvare).
  - "Passa subito a WhatsApp", con le stesse regole: annulla i follow-up non ancora inviati e prepara il messaggio WhatsApp, se il lead ha i requisiti (ha detto sì, ha avuto la demo, non ha prenotato, ha un cellulare italiano).
  - "Riscrivi con l'AI" sulle bozze di risposta: rigenera il testo con le istruzioni attuali e lo lascia in bozza. Esclusa la risposta a chi ha scelto un orario, perché riscriverla prenoterebbe di nuovo.
- [x] **Migrazione 0020:** stato `closed_no_reply`, job `conversation_tick`.
- [x] **Verifica su PGlite** con il lead Michienzi: l'intera sequenza (non aperta, a metà con `?passo=4`, completa, chiusura con orari, chiusura senza risposta), la risposta a metà sequenza e il nurturing.
- [x] **Ripresa dopo il fuori ufficio:** il giorno lavorativo dopo la data di rientro (o dopo 5 giorni lavorativi se la data manca) l'app legge il lead su Instantly.
  - Se la sequenza è ancora attiva non fa nulla.
  - Se Instantly l'ha fermata (succede: sui dati veri le risposte automatiche fermano i lead), scrive un'email "bentornato" nel thread. Poi lo stato torna "Risposto".
- [x] **Obiezione che chiude la conversazione:** casella "Dopo la risposta chiude la conversazione" nella libreria (migrazione 0022). Dopo l'invio della risposta lo stato diventa "Chiuso, non interessato".
- [x] **Prenotazioni dei setter per lead che non hanno mai risposto:** il webhook `appointment_booked` cerca l'email tra i contatti delle campagne e su Instantly imposta "meeting booked", che chiude il lead e ferma la sequenza.
  - Le conversazioni si trovano anche per telefono.

### Fase 6: WhatsApp via GHL [x] (20/10)

- [x] **Chi passa a WhatsApp:** dopo l'email di chiusura e altri `whatsappAfterBusinessDays` giorni lavorativi (Automazione, oggi 2), solo il lead che aveva risposto "interessato", ha ricevuto la demo, non ha prenotato e ha un cellulare italiano. Gli altri vanno in "Chiuso, senza risposta".
- [x] **Testi scritti dall'AI** (`src/services/WhatsappWriter.ts`): sintesi delle email, obiezioni emerse e primo messaggio. Il primo messaggio ha 2-4 righe, nessun link e una sola domanda.
  - `comportamento_demo` non è scritto dall'AI: "Non aperta", "Vista fino al passo N di 6" oppure "Vista tutta".
- [x] **Passaggio** (`src/libs/WhatsappHandoff.ts`), secondo la modalità di Automazione: in bozza lo approvi dal dettaglio conversazione (riquadro "WhatsApp"), in automatico parte da solo.
  - L'app crea su GHL i campi mancanti: `contact.nome_attivita`, `citta`, `servizi`, `link_demo`, `sintesi_email`, `obiezioni_emerse`, `comportamento_demo`, `wa_primo_messaggio`.
  - Poi aggiorna il contatto e aggiunge il tag `wa-outreach`. Lo stato diventa `whatsapp`.
  - Se GHL rifiuta, nel log compare "Passaggio a WhatsApp non riuscito" e la conversazione va in revisione.
- [x] **Risposte WhatsApp** (evento `whatsapp_inbound` del webhook GHL): salvate in `whatsapp_message` e mostrate nel riquadro. La piattaforma non risponde mai su WhatsApp.
- [x] **Interruzioni:** una risposta via email o una prenotazione annullano la bozza WhatsApp.
- [x] **Correzione:** la prenotazione non sovrascrive più i tag del contatto GHL; i tag si aggiungono con `/contacts/{id}/tags`.
- [x] **Correzione della fase 5:** il dettaglio conversazione ora mostra anche i follow-up, le chiusure e i nurturing, per approvarli in modalità bozza.
- [x] **Migrazione 0021:** tabelle `whatsapp_handoff` e `whatsapp_message`.
- [x] **Verifica su PGlite** con il lead Michienzi: dalla risposta con il cellulare fino a bozza, approvazione e stato `whatsapp`; risposta WhatsApp registrata.
- [ ] **Checklist GHL per il titolare:**
  1. Permessi del token: `contacts.write`, `opportunities.write` e `locations/customFields.readonly`.
     - Gli 8 campi personalizzati sono stati creati su GHL il 20/10, quindi `locations/customFields.write` non serve più.
  2. Workflow **"WA Outreach"**:
     - trigger: tag aggiunto `wa-outreach`;
     - azione: messaggio WhatsApp GoGHL (Drip Mode) con testo `{{contact.wa_primo_messaggio}}`, solo in orario lavorativo.
  3. **Conversation AI** su WhatsApp:
     - nel prompt `{{contact.sintesi_email}}`, `{{contact.obiezioni_emerse}}`, `{{contact.comportamento_demo}}` e `{{contact.link_demo}}`;
     - il calendario "Call Demo - 30 min" per prenotare.
  4. Workflow **"Risposta WhatsApp"**:
     - trigger "Customer Replied", canale WhatsApp;
     - azione Webhook verso `/api/webhooks/ghl?secret=…` con Custom Data `event = whatsapp_inbound` e `message = {{message.body}}`.
  5. **Handover** del bot a una persona: webhook con `event = handover`, come in fase 4.

### Fase 7: dashboard metriche [x] (20/10)

- [x] **Pagina `/dashboard/metrics`** ("Metriche" nella barra laterale), con il periodo scelto come in Utilizzo. Conta le conversazioni iniziate nel periodo e lascia fuori quelle di test.
  - **Numeri:** lead che hanno risposto, demo inviate, call prenotate (con la percentuale su chi ha risposto), passati a WhatsApp.
  - **Funnel:** hanno risposto → demo inviata → demo aperta → demo vista tutta → call prenotata, con la percentuale rispetto al passo prima.
  - **Da dove arrivano le call:** dalla demo, rispondendo all'email, da GHL (setter o WhatsApp).
  - **Per categoria della prima risposta:** lead, demo inviate, call prenotate e tasso.
  - **Per obiezione:** lead che l'hanno sollevata, call prenotate e tasso.
- [x] **Calcolo puro** in `src/utils/ReplyStats.ts`, con test; le query sono in `src/libs/ReplyStats.ts`.
  - Una demo conta come "inviata" solo se un'email inviata contiene il suo link.
- [x] **Verifica su PGlite** con 3 conversazioni (interessato con call dalla demo, obiezione con call da GHL, non interessato): numeri corretti.

### Campagne gestite dal bot [x] (20/10)

- [x] **Scelta per campagna:** colonna `campaign.bot_managed` (migrazione `0026`, default no).
  - Si sceglie al lancio, con la casella "Gestisci le risposte con il bot" nella scheda "Invia".
  - Si cambia in Automazione, nella scheda "Campagne gestite dal bot".
- [x] **Campagna dei venditori:** alla risposta la conversazione va in pausa (`paused_reason = unmanaged_campaign`, evento "Campagna gestita dai venditori"). Il bot non classifica, non risponde e non fa follow-up.
  - Le richieste di stop vengono bloccate lo stesso: blocklist Instantly e DND su GHL.
  - Se la campagna passa ai venditori a sequenza in corso, il prossimo follow-up mette in pausa la conversazione e gli invii programmati vengono annullati.
  - Riattivando il bot, le conversazioni già in pausa restano dei venditori.
- [x] **Campagna del bot:** insieme alla risposta parte il job `ghl_bot_assign` (`src/libs/GhlBotAssign.ts`). Il job:
  - assegna il contatto GHL a Bot AI e gli mette il tag `bot-ai`;
  - aspetta l'opportunità creata dal workflow, riprovando con attese crescenti, e la passa a Bot AI;
  - non tocca le conversazioni con la call già prenotata.
- [x] **Verifica su PGlite:** la campagna del bot accoda la risposta e l'assegnazione; quella dei venditori va in pausa senza chiamate AI e annulla gli invii programmati.

### Pagina Risposte e risposte automatiche [x] (22/10)

- [x] **Ricerca live:** per email, azienda, nome o cognome, filtra mentre si scrive (senza tasto "Cerca").
- [x] **Filtri** al posto delle tab "Tutte / Da revisionare": stato, risposta inviata (sì/no), gestione (bot o venditori, con la stessa regola di `isBotManaged`). "Da revisionare" è il filtro stato "Revisione manuale". I filtri restano nell'URL (`q`, `state`, `answered`, `bot`).
- [x] **Risposta automatica:** nuova categoria e nuovo stato `auto_reply` (migrazione `0029`), categoria `risposta_automatica` del classificatore.
  - Copre conferme di ricezione, ticket e autoresponder che non sono un'assenza; il fuori ufficio resta a parte.
  - Il bot non risponde, non fa follow-up e non la manda in revisione. Lo stato non è finale: se poi il lead risponde davvero, la conversazione riparte.
- [x] **Verifica su PGlite:** migrazione applicata, filtri combinati corretti.
### Risposte programmate [x] (22/10)

Richiesta del titolare, nata dalla dott.ssa Tallarico ("mi può contattare ad inizio settimana prossima"). Prima la risposta partiva dopo 15-20 minuti, e il ricontatto vero arrivava solo con il nurturing, 30 giorni dopo.

- [x] **Data di ricontatto:** il classificatore restituisce `data_ricontatto`, salvata in `reply_classification.recontact_at` (migrazione `0030`) e mostrata nel dettaglio come "Da ricontattare".
  - Il formato è `YYYY-MM-DD`, oppure `YYYY-MM-DDTHH:mm` se il lead dà anche l'ora.
  - Vale null per periodi vaghi ("tra qualche mese") e per il fuori ufficio.
- [x] **Una sola email, alla data chiesta** (decisione del titolare): nessuna conferma subito.
  - Con la sola data l'email parte all'apertura di quel giorno, più 0-45 minuti casuali; con l'ora, a quell'ora.
  - Sempre in orario lavorativo, e solo entro 90 giorni (`scheduleRecontact` in `src/utils/BusinessHours.ts`).
- [x] **Il testo è il ricontatto:** il writer sa in che giorno parte l'email (`recontactOn`) e la scrive per quel giorno, senza "la ricontatto più avanti". Dice "come d'accordo" solo se il lead l'aveva chiesto. Un'email che parte un altro giorno non propone orari della call, perché sarebbero vecchi.
- [x] **Modalità automatica:** l'email si programma da sola alla data suggerita. **In bozza** la data arriva precompilata nel campo "Invia il (ora italiana)": su una bozza `scheduled_for` è la data proposta.
- [x] **Dashboard:**
  - ogni bozza si può programmare per una data e un'ora; con il campo vuoto parte come prima;
  - un'email già programmata si può modificare e spostare ("Aggiorna programmazione") o annullare;
  - "Riscrivi con l'AI" scrive per la data scelta nel campo.
- [x] **Spostamenti:** il job `reply_send` porta con sé l'orario per cui è stato accodato. Se l'email è stata spostata, il job vecchio non invia (come `dueAt` nei follow-up). Una nuova risposta del lead prima della data annulla l'invio, come già succedeva.
- [x] **Verifica su PGlite:**
  - la risposta della Tallarico dà `recontact_at = 2026-10-26` e una bozza per lunedì alle 9:xx, scritta come ricontatto;
  - in automatica, "lunedì verso le 15" diventa un invio alle 15:00;
  - il job vecchio dopo uno spostamento non invia;
  - una nuova risposta del lead annulla l'invio.
- [ ] **Bozza vera della Tallarico** (titolare, dopo il deploy):
  1. aprire la bozza;
  2. mettere lunedì 26/10 alle 9:30;
  3. "Riscrivi con l'AI";
  4. "Approva e programma".

### Test campagne [x] (24/10)

Richiesta del titolare: tenere traccia di ogni campagna come un test, per confrontarle.

- [x] **Pagina `/dashboard/tests`** ("Test campagne" nella barra laterale, sotto Campagne). Una riga per ogni campagna inviata su Instantly, archiviate comprese. Colonne:
  - **campagna** (fissa a sinistra), con data e bot o venditori;
  - **cosa si è testato:** testo scritto a mano, modificabile direttamente dalla tabella;
  - **target e zona:** scritti a mano dalla scheda campagna, altrimenti la professione e la provincia (o città) più comuni tra i contatti, altrimenti le prime due parti del nome (`idraulico · Roma · #1`, anche con i trattini);
  - **email:** pulsante "Vedi email" con la prima email inviata al primo lead approvato, come esempio della struttura (decisione del 24/10: niente analisi AI);
  - **contattati** e rimbalzi, da Instantly;
  - **risposte:** risposte uniche di Instantly, escluse quelle automatiche, quindi anche quelle arrivate prima del webhook;
  - **positive:** "interessato" per il bot, oppure etichetta Interessato, Meeting booked, Meeting completed o Closed su Instantly, oppure call prenotata dopo la risposta;
  - **risposte per email:** a quale email della sequenza hanno risposto (`email_replied_step` di Instantly);
  - **demo complete** (passo 6), **call prenotate** (demo, email, GHL, Meeting su Instantly), **no show** (GHL o etichetta No show), **chiusure** (Won su GHL o Closed su Instantly, con il valore). Una chiusura o un no show contano sempre anche come call;
  - **costo, costo per call, costo per chiusura**, in dollari: spesa della campagna (ricerche e AI) più la sua quota delle ricerche lead, divisa in parti uguali tra i lead con email trovati da ogni ricerca. Le caselle Instantly non ci sono.
- [x] **Percentuali:** menu a tendina "Sui contattati" o "Sul passo precedente" (positive sulle risposte, demo e call sulle positive, no show e chiusure sulle call), con la spiegazione dentro ogni voce. Il cambio e l'ordinamento (clic sulle intestazioni) avvengono nel browser, senza ricaricare. Ogni intestazione spiega la colonna al passaggio del mouse. Intestazione e prima colonna restano fisse durante lo scorrimento.
- [x] **Copia di Instantly** (`src/libs/InstantlySync.ts`): tabelle `instantly_campaign_stat` (totali di ogni campagna) e `instantly_lead` (ogni lead che ha risposto, con step ed etichetta). Una lettura completa dura circa 5 secondi.
  - La prima visita della pagina la fa subito; poi, se la copia ha più di 15 minuti, la visita accoda il job `instantly_sync` (lo esegue il cron) e mostra la copia attuale.
  - "Aggiorna da Instantly" la rifà subito.
- [x] **Scheda della campagna:** riquadro "Test della campagna" con gli stessi numeri (entrambe le percentuali), risposte per email, costi, "Vedi email" e i campi target, zona e cosa si è testato.
- [x] **Esiti da GHL:** tabella `lead_outcome` (organizzazione + email) con prima call prenotata, no show, chiusura e valore. La scrive il webhook GHL con `appointment_booked`, `appointment_noshow` e `deal_won` (`value` accetta "97", "97,00" o un numero). No show e vendite compaiono nel log della conversazione e non cambiano lo stato.
- [x] **Migrazioni:** `0032` (colonne `target`, `zone`, `hypothesis` su `campaign`, tabella `lead_outcome`) e `0033` (tabelle della copia di Instantly, `no_show_at`, via `prompt_analysis`, job rinominato da `campaign_analysis` a `instantly_sync`).
- [x] **Verifica su PGlite** con migrazioni da zero e copia vera di Instantly: "nutrizionista · Roma · #2" passa da 1 a 57 risposte, 10 positive (9 interessati più 1 meeting), risposte per email 13/25/20; no show, chiusura e costi corretti.
- [ ] **Workflow GHL "Vendita chiusa"** e **"No show"** (titolare), vedi la sezione 3. Senza, chiusure e no show vengono solo dalle etichette Instantly.
- [x] **Recupero da GHL (24/10)** (`src/libs/GhlSync.ts`, `src/utils/GhlOutcomes.ts`): ogni aggiornamento della copia di Instantly (visita della pagina dopo 15 minuti o "Aggiorna da Instantly e GHL") legge anche la pipeline "4. Cold Email | Instantly" e il calendario "Call Demo - 30 min", e scrive in `lead_outcome` le call prenotate prima del webhook o da un setter:
  - **call:** opportunità nelle fasi Chiamata Schedulata, Chiamata Completata, No Show o Chiuso, oppure vinta, oppure un appuntamento non cancellato sul calendario (così conta anche chi poi è finito in Squalificato). "Interessato, Chiamata Non Schedulata" non conta;
  - **no show:** fase No Show o appuntamento segnato "noshow"; **chiusura:** stato Won o fase Chiuso, con il valore dell'opportunità;
  - contano solo i contatti della pipeline, per ogni organizzazione che li ha in una campagna. Le date già registrate dal webhook restano, GHL riempie solo quelle mancanti; nulla viene mai cancellato;
  - le fasi si riconoscono dal nome: se si rinominano su GHL, va aggiornato `BOOKED_STAGES` in `src/utils/GhlOutcomes.ts`.
  - Prova a secco del 24/10: 266 opportunità, 7 appuntamenti, 6 lead con call (1 no show), tutti abbinati a contatti di 4 campagne.

### Risposta ai non interessati, versione A o B [x] (26/10)

Richiesta del titolare: una seconda versione dell'unica email a chi risponde di no, da scegliere **lead per lead** nel dettaglio della conversazione (non un'impostazione generale: la prima versione, migrazione `0041`, la metteva in Automazione ed è stata tolta con la `0042`).

- [x] **Scelta sulla bozza:** sopra il testo della bozza che risponde a un "non interessato" compaiono le tab "Versione A / Versione B". Cambiare tab riscrive la bozza con l'AI in quella versione. La versione sta in `outbound_email.not_interested_version`: `a` per ogni nuova risposta a un no, null per tutte le altre email. La `0042` mette `a` anche sulle risposte a un no già esistenti.
  - **A** (com'era): ringrazia, presenta l'offerta come quasi un regalo e chiede il permesso di mandare la demo. Nessun link.
  - **B**: "visto che avevo già preparato un esempio pratico per {azienda}, mi sembrava un peccato non condividerlo", poi 👉 link alla demo e "se un giorno dovesse tornarti utile, sai dove trovarmi". Il modello del testo è `NOT_INTERESTED_SHARE_GUIDANCE` in `src/services/ReplyWriter.ts`.
- [x] **Con la B** la demo si costruisce al cambio di versione e l'email deve contenere il link. Dopo l'invio lo stato passa a `demo_sent` (e a `demo_viewed` quando la apre), ma nessun follow-up viene programmato. Un secondo no chiude la conversazione come prima.
  - Fino al fix del 26/10 lo stato restava `classified`: i due lead già colpiti (`aa0b920a…`, `cd10888b…`) vanno portati a `demo_sent` a mano.
- [x] **In modalità automatica** la risposta a un no parte in versione A senza aspettare: la B si può scegliere solo su una bozza.
- [x] **Filtro per campagna** nella pagina Risposte (26/10): selezione multipla, nell'URL come `campaign` ripetuto.

### Demo versione B: il video di Gigi (VSL) [x] (29/10)

Richiesta del titolare: una nuova versione della demo che parta con un tocco e poi non si fermi più, con Gigi che parla di tutto con la sua voce, e più personalizzata sui problemi del settore del lead (meccanico: promemoria delle revisioni; osteopata: promemoria delle visite). **La versione A e la sua generazione restano identiche**: la B si aggiunge sopra la stessa demo e si sceglie lead per lead.

- [x] **Riquadro Demo:** tab "A · Tour guidato / B · Video con Gigi", pulsante "Crea versione B" / "Rigenera versione B", anteprime separate (`?anteprima=1&versione=a|b`) e i problemi su cui punta la B. La versione scelta sta in `demo.version` (migrazione `0044`); finché la B non è scritta il link mostra la A.
- [x] **Pain point dalle call:** `src/utils/DemoPainPoints.ts`, distillati dalle call con fisioterapista, autofficina, avvocato, naturopata, nutrizionista e agente immobiliare, più dentisti/studi medici e parrucchieri/estetica. Il settore si riconosce dalla categoria Google o dal nome; l'AI riceve il suo settore in testa e gli altri come esempio.
- [x] **Copione:** job `demo_vsl` (`src/libs/DemoVsl.ts`). Claude (`src/services/DemoVslWriter.ts`) legge la demo già fatta e scrive in `demo.vsl`: i 2-3 problemi, una chat nuova sul problema principale, il **promemoria** tipico del settore (scena nuova dopo la chat), il follow-up per il cliente che quel settore perde più spesso e una battuta di Gigi per ogni scena. Prezzo, recensioni, contatti e prenotazione hanno battute fisse (`DemoPage.vsl_line_*`), scritte per un video che va da solo (niente "premi Avanti").
- [x] **Voce:** stessa voce dei video (Gemini TTS "Achird" su Kie, impostazioni in `src/utils/GigiVoice.ts`), una per battuta, convertita in MP3 (`src/utils/Mp3.ts`, circa 6 KB al secondo) e salvata in `demo_voice`, servita da `/api/demo-voices/<id>`. Costo: pochi centesimi a demo; pronta in qualche minuto. Una voce si usa solo se la battuta mostrata è ancora identica a quella letta; senza voce la battuta scorre scritta per il tempo che servirebbe a dirla.
- [x] **Player** (`src/components/demo/vsl/DemoVsl.tsx`): un tocco su "Guarda la demo" sblocca l'audio, poi ogni scena passa da sola quando Gigi ha finito e la scena ha finito di animarsi (chat, promemoria, automazione, recensioni). Pausa, indietro e salta restano disponibili; se il telefono va in background la demo si mette in pausa. Le recensioni si "toccano" da sole a 5 stelle. Si ferma alla prenotazione.
- [x] **Gigi che parla:** loop muti ricavati dal video del prezzo (`public/demo/gigi-talk.mp4` a figura intera e `gigi-talk-face.mp4` solo la testa, per la mini giraffa nella barra). Si animano mentre c'è la voce; il labiale non è sincronizzato parola per parola (scelta del titolare: niente Kling per ogni lead, sarebbero 8-10$ a demo).
- [x] **Ritmo (29/10):** voce a 1,3x, silenzi ai bordi delle voci tagliati prima dell'MP3, tutte le voci scaricate in anticipo al primo tocco, follow-up a 1 secondo per passo e 0,2 secondi tra una scena e l'altra.
- [x] **Musica sotto Gigi (29/10):** `public/demo/gigi-music.mp3`, base strumentale di 2 minuti fatta una volta con Suno su Kie, in loop. È abbassata nel file stesso (circa -41 LUFS, la voce è a -19) perché sui telefoni la pagina non può cambiare il volume.
- [x] **Script per una sola demo:** `npx dotenv -c -- npx tsx scripts/generate-demo-vsl.ts <slug>` scrive e dà voce alla B senza passare dalla coda; con `--voice` rifà solo le voci.
- [ ] **Versione B automatica per i nuovi lead:** non fatta. Oggi la B si crea a mano dal riquadro Demo.

---

## 5. Punti da verificare

- [x] **Blocklist Instantly:** `POST /block-lists-entries` con `bl_value`, confermato dallo schema dell'API il 20/10.
- [x] **Etichette di interesse Instantly:** mappa confermata (1 interessato, 2 meeting booked, 0 fuori ufficio, -1 non interessato, -2 persona sbagliata, -3 perso, -4 no show).
- [x] **`stop_on_auto_reply`:** esiste ed è `false` sulle campagne. Però, sui dati veri, lead con risposte automatiche risultano comunque fermi (`status: 3`): da qui la ripresa dopo il fuori ufficio.
- [x] **Obiezioni:** importate dal titolare.
- [?] **Instantly lento:** se una risposta non è ancora visibile nell'API quando arriva il webhook, il job ritenta 5 volte e poi la manda in revisione.
- [?] **Tono delle prime bozze vere:** rileggerle prima di passare ad automatica.
- [?] **Stop della sequenza con "meeting booked":** Instantly documenta che il lead "può" essere segnato come completato. Controllare sul primo lead prenotato da un setter.

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
| Test campagne | `src/libs/CampaignTests.ts`, `src/utils/CampaignTests.ts`, `src/libs/InstantlySync.ts`, `src/app/[locale]/dashboard/tests/` |
| Worker | `src/libs/JobWorker.ts`, con i job `reply_process`, `reply_write` e `reply_send` |
| Test | `*.test.ts` accanto al codice, `tests/integration/ReplyAutomationApi.integ.ts` |

---

## 8. Insidie note: leggere prima di toccare qualcosa

- **Il DB di sviluppo è Neon, cioè quello vero.** `bun run dev`, `db:migrate` e `bun run test:e2e` applicano le migrazioni su Neon. Per le prove usare un PGlite usa e getta:
  - avviarlo su una porta libera con `TZ=UTC npx pglite-server -p 54999 --run <script>`;
  - passare `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54999/postgres` esplicito.
- **Anche `build-local` migra Neon:** il suo passo `db-server:memory` lancia `db:migrate` con dotenv, quindi la migrazione finisce su Neon nonostante il nome. Il 29/10 ha applicato così la `0044` (solo aggiunte: colonne con default, una tabella e un valore di enum).
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
3. In **Risposte → Importa risposte**, inserire l'email di un lead che ha risposto a una campagna creata qui.
4. Nel dettaglio che si apre, dopo qualche secondo, controllare:
   - classificazione;
   - nessuna bozza;
   - per gli interessati, riquadro Demo e "Apri anteprima" (la pagina);
   - log ("Risposta importata").
5. Le conversazioni di test create prima del 23/10 con la simulazione restano e funzionano come prima: l'invio è simulato e non parte nulla davvero.

---

## 10. Prompt per Conversation AI (GHL)

Da incollare nelle istruzioni del bot WhatsApp. Note:
- **Prezzo e posti** sono scritti a mano: se cambiano in Automazione, vanno aggiornati anche qui.
- **Campi `{{contact.…}}`:** se GHL non li sostituisce nelle istruzioni del bot (provare con un contatto di test), togliere il blocco "Contesto di questo lead". Il bot vede comunque il primo messaggio nella conversazione.

```
Sei Gianmarco del team Girhouse e scrivi su WhatsApp a titolari di piccole attività italiane (studi, artigiani, negozi). Hanno risposto "sì" a una nostra email, hanno ricevuto una pagina demo preparata per la loro attività, ma non hanno ancora prenotato la call. Il tuo unico obiettivo è fissare una call di 30 minuti sul calendario "Call Demo - 30 min".

COSA OFFRIAMO
- Rifacciamo la pagina web dell'attività e configuriamo un sistema che mette telefono, WhatsApp ed email in un unico posto: risposta automatica entro 30 secondi a chi scrive o chiama quando il titolare è occupato, follow-up automatici a chi non risponde, raccolta delle recensioni su Google.
- Configuriamo tutto noi, con un team italiano. Numeri e account restano del cliente.
- 97€ al mese, senza contratto. Soddisfatti o rimborsati: se dopo 30 giorni non è soddisfatto, gli rimborsiamo quanto ha pagato. Non c'è una prova gratuita. Il prezzo resta bloccato per chi entra adesso. Prendiamo solo 10 nuove attività al mese.

CONTESTO DI QUESTO LEAD
- Attività: {{contact.nome_attivita}} ({{contact.citta}})
- Servizi: {{contact.servizi}}
- Cosa ci siamo detti via email: {{contact.sintesi_email}}
- Dubbi emersi: {{contact.obiezioni_emerse}}
- Come ha guardato la demo: {{contact.comportamento_demo}}
- Pagina demo: {{contact.link_demo}}

COME SCRIVI
- Italiano, tono umano e cordiale, come una persona vera che scrive dal telefono. Messaggi brevi, da 1 a 3 frasi.
- Dai del "lei" se il lead lo usa, altrimenti segui il suo modo di scrivere.
- Una sola domanda per messaggio. Niente elenchi, niente maiuscole per enfasi, al massimo un'emoji ogni tanto.
- Prima l'empatia, poi la proposta: se il lead racconta un problema o un dubbio, riconoscilo in una frase prima di proporre la call.
- Non inventare mai dati, risultati, nomi di clienti o promesse che non sono scritti qui. Se non sai rispondere, di' che è proprio una delle cose che vediamo nella call.
- Manda il link della demo solo se il lead lo chiede o dice di non averlo visto.

COME PORTI ALLA CALL
- Quando il lead è disponibile, proponi due orari liberi del calendario, in giorni diversi, e lascialo scegliere. Dopo la prenotazione conferma giorno e ora per iscritto.
- La call dura 30 minuti, si fa una sola volta per attività e serve a vedere dal vivo la piattaforma configurata per lui.

OBIEZIONI FREQUENTI (una o due frasi, poi una domanda)
- "Costa troppo": basta un cliente in più al mese per ripagarlo, e se dopo 30 giorni non è soddisfatto gli rimborsiamo quanto ha pagato.
- "Ho già un sito": il punto non è il sito, ma chi risponde ai contatti quando lui è occupato.
- "Non ho tempo": configuriamo tutto noi, a lui servono solo i 30 minuti della call.
- "Ci penso": nessun problema; chiedi cosa vorrebbe vedere per decidere e proponi la call proprio per quello.

QUANDO PASSI A UNA PERSONA
- Se il lead chiede di parlare con una persona, è arrabbiato o si lamenta, chiede sconti o condizioni diverse, o fa domande tecniche o contrattuali che non trovi qui: digli che lo fai ricontattare da un collega e passa la conversazione a un operatore.
- Se il lead chiede di non essere più contattato: scusati in una frase, conferma che non riceverà altri messaggi e non scrivere più.

MAI
- Mai insistere più di due volte se il lead non vuole la call.
- Mai parlare di intelligenza artificiale o di "dipendente AI": è "un sistema che ti dà una mano", con un team italiano dietro.
- Mai scrivere fuori dall'orario lavorativo (dal lunedì al venerdì, dalle 9 alle 18).
```
