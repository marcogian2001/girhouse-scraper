# Passaggio a Stripe Billing per gli abbonamenti Girhouse

Prompt per continuare il lavoro in una nuova sessione. Stato al 4 novembre 2026.

## Obiettivo

Spostare gli abbonamenti del funnel Girhouse (47 € il primo mese, poi 97 € al mese) da WooCommerce + WPSubscription a Stripe Billing. Il checkout `/attiva/` deve restare identico a oggi per il cliente. Alla fine si tolgono WooCommerce, WPSubscription, WooCommerce Stripe Gateway e WooPayments.

Il cliente vuole la garanzia di poter avere:

1. email di promemoria su misura;
2. fatture su misura;
3. un portale su misura per gestire l'abbonamento.

Sono tutte fattibili:

- Le email partono da GHL sugli eventi di Stripe. Quelle di Stripe si spengono solo dopo aver provato le nostre per pagamento fallito e conferma della banca (3D Secure).
- Le fatture si possono fare in due modi: la fattura Stripe personalizzata oppure un PDF generato dal sito. Il contenuto fiscale va deciso con il commercialista: Girhouse LLC è una società USA e i clienti sono italiani.
- Il portale è una pagina WordPress nostra che chiama le API di Stripe dal server.

## Dove si lavora

- **Sito:** WordPress su Hostinger, host SSH `omakase`, cartella `domains/girhouse.com/public_html`, con wp-cli.
- **Plugin custom:** mu-plugin `wp-content/mu-plugins/girhouse-funnels.php` e cartella `girhouse-funnels/`.
- **Asset delle pagine funnel:** `wp-content/uploads/girhouse/funnels/`.
- **Repository locale:** `/Users/gianmarcoscandale/Dev/girhouse-scraper`, che contiene solo la documentazione. La storia del funnel è in `docs/ANALISI_QUIZ_FUNNEL.md`.
- **Backup completo prima del lavoro:** `~/backups-girhouse/20261103-2008-pre-stripe-billing/` sul server, con questi file:
  - `database.sql.gz`: 89 tabelle;
  - `codice.tar.gz`: wp-config, .htaccess, plugins, mu-plugins, temi;
  - `uploads.tar.gz`.

## Situazione attuale dei pagamenti

- **Plugin attivi:** WooCommerce, WooCommerce Stripe Gateway 11.1.1 (live) e WPSubscription 2.5.0 ("Subscriptions for WooCommerce with Stripe Recurring Payments").
  - WPSubscription rinnova addebitando la carta salvata da WordPress.
  - In Stripe non esistono prodotti, prezzi o abbonamenti, solo clienti e pagamenti singoli.
- **WooPayments:** è attivo ma escluso dalle richieste del checkout.
- **Prodotto WooCommerce:** 21633 "Pacchetto Girhouse, tutto incluso".
- **Ordini e abbonamenti:** ci sono 1 ordine e 1 abbonamento. Prima di migrare va verificato se sono reali o di prova.
- **Account Stripe:** USA (Girhouse LLC), valuta predefinita USD. Gli addebiti sono in euro.
- **File del checkout:** `girhouse-funnels/checkout.php` e `template-checkout.php`.
  - Coupon WooCommerce `primomese47`.
  - Timer dell'offerta: cookie `gh_offer` (scadenza firmata con `wp_hash`, 10 minuti + 60 secondi di tolleranza), funzioni `gh_funnels_offer_*`. A timer scaduto il primo mese costa 97 €.
  - Aspetto del modulo Stripe tramite il filtro `wc_stripe_upe_params` (`.TermsText` 13px `#57554F`). Va replicato nell'`appearance` del Payment Element.
  - Al pagamento riuscito `gh_funnels_start_workflow($order_id)` fa l'upsert del contatto e lo aggiunge al workflow GHL `e6ce5f3e-a416-4cdd-affe-c91b59142048` ("3. Demo Iniziata (NO Trial)"). Chiamata asincrona con Action Scheduler.
  - Parte anche il vecchio webhook F9 (`GH_FUNNEL_WEBHOOK`). Va chiesto al cliente se fa partire lo stesso workflow, per evitare doppie iscrizioni.
- **Collegamenti con GHL:**
  - Costante `GH_GHL_TOKEN` in wp-config, location `bupvNmqh3Ng9opZrbF48`.
  - Funzione `gh_cal_api()` in `prenota.php`.
  - Campi contatto `contact.fonte` e `contact.funnel` (vedi `gh_cal_contact()`).
- **Fonte e funnel:**
  - Ogni pagina funnel ha `data-fonte` e `data-funnel`, presi da `uploads/girhouse/funnels/fonti.json`.
  - Il checkout F2 si apre con `/attiva/?funnel=f2`.
  - Il nuovo checkout deve passare fonte e funnel a GHL come fa il calendario.
- **Dipendenze da WooCommerce da togliere prima di eliminarlo:**
  - `prenota.php` → `gh_cal_ip_country()` usa `WC_Geolocation` con ipinfo.io. Va sostituita con una chiamata diretta.
  - `girhouse-funnels.php` → `gh_funnels_is_light_request()` e `gh_funnels_fix_session_cookie()`. Servono solo a WooCommerce.

## Decisione presa

- **Checkout:** su misura e identico a oggi. Stesso Payment Element, Apple Pay e Google Pay, Stripe Billing dietro.
- **Al clic su "Attiva", lato server:**
  - trova o crea il cliente Stripe;
  - crea l'abbonamento al prezzo da 97 €/mese con `payment_behavior=default_incomplete`;
  - aggiunge il coupon da 50 € valido una volta, solo se il cookie `gh_offer` è ancora valido;
  - restituisce il client secret del primo pagamento.
- **Nel browser:** il Payment Element conferma il pagamento. Il 3D Secure lo gestisce Stripe.
- **Webhook Stripe nel plugin, con verifica della firma:**
  - `invoice.paid`: al primo pagamento fa partire il workflow GHL e crea l'utente WordPress con l'id cliente Stripe nei meta;
  - `invoice.payment_failed`;
  - `invoice.upcoming`;
  - `customer.subscription.updated`;
  - `customer.subscription.deleted`.
- **Chiavi:** costanti in `wp-config.php`. Al browser arriva solo la chiave pubblica. Non cercare chiavi di pagamento nei file `.env`.

## Ordine dei lavori

1. In Stripe, prima in modalità test: prodotto "Sistema Girhouse", prezzo 97 € al mese, coupon da 50 € valido una volta.
2. Nuovo checkout e webhook in modalità test. Il cliente fa da solo i pagamenti di prova: Claude non inserisce mai dati di carte.
3. Passaggio a live solo con il via esplicito del cliente.
4. Spostamento degli abbonamenti attivi su Stripe Billing, sulle carte già salvate e con la stessa data di rinnovo. Poi si spegne il rinnovo in WPSubscription.
5. Email su misura da GHL. Le email clienti di Stripe si spengono solo dopo la prova di quelle per pagamento fallito e conferma della banca.
6. Area clienti `/account/` con accesso tramite link via email: stato, fatture, cambio carta, pausa, sconto per restare, disdetta a fine periodo, percorso di disdetta con motivo e offerta, eventi mandati a GHL.
7. Fatture su misura, dopo aver sentito il commercialista.
8. Sostituzione della geolocalizzazione del calendario, export dei dati WooCommerce, disattivazione dei 4 plugin per qualche settimana, poi eliminazione.

## Regole di lavoro

- Si scrive in italiano, in modo semplice, con il testo in sentence case.
- Si fa un backup prima di ogni modifica.
- Deploy del PHP:
  - si copia il file come `.new`;
  - si controlla con `php -l` sul server;
  - si rinomina con `mv`.
- Cache delle pagine: `wp eval 'WP_Optimize()->get_page_cache()->purge();'`. Le pagine funnel restano in cache 60 secondi.
- `wp db export` sul server non scrive niente: per il database si usa mysqldump con le credenziali lette da `wp config get`.
- Per i dati di Elementor non si usa `update_post_meta` con `wp_slash`, perché ha rovinato la homepage: si scrive con `$wpdb->update`.
- Campi e controlli dei moduli sempre personalizzati, mai quelli predefiniti del browser.
- Durante un briefing sui testi si risponde soltanto e si pubblica solo con il via esplicito.
- Dopo ogni lavoro finito si aggiorna `docs/ANALISI_QUIZ_FUNNEL.md` e si fa il commit in stile Conventional Commits.
- La cartella `.claude/` non tracciata non si tocca.

## Stato del passo 1 (4 novembre 2026)

Fatto in modalità test: prodotto `prod_VYw9HnkZedewiJ`, prezzo `price_1UXoH6RpePwqv78H2Z6dWfa1` (lookup key `sistema_girhouse_mensile`), coupon `primomese47`. In Stripe esistono già prodotti e abbonamenti creati da GHL, compreso un suo "Sistema Girhouse": dettagli in `docs/ANALISI_QUIZ_FUNNEL.md`.

## Stato al 4 novembre 2026, sera: checkout live, WooCommerce eliminato

Passi 1-4 e la parte "plugin" del passo 8 sono fatti. Restano i passi 5 (email GHL), 6 (area clienti `/account/`), 7 (fatture) e la pulizia delle tabelle WooCommerce nel database.

- **Live**: `GH_STRIPE_MODE = live`, `GH_BILLING_ON = true`. Chiavi `GH_STRIPE_LIVE_PUBLISHABLE`, `GH_STRIPE_LIVE_SECRET`, `GH_STRIPE_LIVE_WEBHOOK` messe dal proprietario. Prodotto `prod_VYxHgHBHa1wjLd`, prezzo `price_1UXpMrRpePwqv78HZOelpAJ5` (`GH_STRIPE_LIVE_PRICE`), coupon `primomese47` da 50 € una volta (`GH_STRIPE_LIVE_COUPON`). Webhook live `we_1UXpK7RpePwqv78HrPqaC77M`, creato dal proprietario con API `2024-06-20`: il codice legge l'abbonamento della fattura in entrambi i formati.
- **Dominio dei portafogli in live**: `girhouse.com` non era registrato come payment method domain (WooCommerce usava un sistema precedente). Registrato: `pmd_1UXpNyRpePwqv78Hn5GOfUlY`. Pulsanti rapidi in colonna (`layout.maxColumns: 1`), come prima.
- **Plugin eliminati** su richiesta del proprietario: WooCommerce, WooCommerce Stripe Gateway, WPSubscription, WooPayments (`wp plugin delete`, che non esegue la disinstallazione: le tabelle restano nel database). All-in-One WP Migration e Duplicate Post non c'erano già più prima di oggi.
- **Webhook WooCommerce disattivati** in Stripe: `we_1UXfotRpePwqv78HDEUAV4id` (live) e `we_1UXfosRpePwqv78HJ8hikVHC` (test).
- **Codice senza WooCommerce**:
  - `checkout.php` riconosce `/attiva/` e `/condizioni-di-vendita/` dallo slug, tiene timer, riga delle condizioni, modelli, noindex, asset leggeri ed elenco degli script per il quiz.
  - `girhouse-funnels.php` senza correzione dei cookie di sessione e senza `wc-ajax`.
  - `billing.php` avvia `gh_billing_first_payment` dopo la risposta a Stripe (`litespeed_finish_request` o `fastcgi_finish_request`), non più con Action Scheduler.
  - `prenota.php`: paese dall'IP con ipinfo.io e, se risponde 429 (limite pieno: l'IP del server è condiviso), con api.country.is. Paese in cache un giorno, errore 10 minuti. Entrambi i servizi ricevono l'IP del visitatore: da citare nella privacy.
- **Il cron `action_scheduler_run_queue` resta**: è di Rank Math, che include Action Scheduler.
- **Backup**: `~/backups-girhouse/20261104-pre-live/` (database, codice con i plugin WooCommerce, upload dei funnel) ed esportazione leggibile in `woocommerce-export/` (ordini, meta, impostazioni, prodotti, tabelle).
- **Controllato**: `/attiva/` con `pk_live_`, 47 €, nessun errore e senza jQuery su 1366×900 e 390×844; condizioni di vendita; calendario con gli orari; quiz e landing; homepage e pagine servizio; webhook live con firma; diagnosi dei pulsanti rapidi spenta in live.
- **Da fare**:
  - primo pagamento vero, a cura del proprietario;
  - togliere i meta di test (`gh_stripe_mode = test`) dall'utente WordPress 2;
  - eliminare `template-checkout.php`, che non si usa più;
  - rigenerare la chiave segreta di test, che è passata in chat;
  - decidere se tenere il "Sistema Girhouse" creato da GHL accanto a quello del sito.

## Stato del passo 2 (4 novembre 2026, in corso)

Il codice del checkout nuovo è sul server ma spento: si accende solo quando in `wp-config.php` ci sono le chiavi di test, e anche allora solo con il link di anteprima `/attiva/?anteprima=<codice>` (codice da `wp eval 'echo gh_billing_preview_code();'`). Il checkout WooCommerce resta quello di tutti.

- `mu-plugins/girhouse-funnels/billing.php`:
  - `POST /wp-json/gh-funnels/v1/attiva/abbonamento`: cliente Stripe trovato per email o creato; abbonamento `default_incomplete` al prezzo di test; coupon solo con il timer `gh_offer` valido; restituisce il segreto del primo pagamento e il link di conferma firmato. Abbonamenti incompleti della stessa persona riusati o annullati; niente secondo abbonamento se ne ha già uno attivo; limite di 12 tentativi l'ora per IP; campo trappola `sito`.
  - `POST /wp-json/gh-funnels/v1/stripe/webhook`: firma verificata con `GH_STRIPE_TEST_WEBHOOK`; eventi doppi ignorati. `invoice.paid` con `subscription_create` avvia `gh_billing_first_payment` (utente WordPress con `gh_stripe_customer`, poi GHL solo in live). In test GHL non riceve niente: il registro `~/domains/girhouse.com/gh-billing.log` dice cosa sarebbe partito.
  - Pagina di conferma `/attiva/?conferma=<sub>&k=<firma>`: dati da Stripe, mostrati solo nella prima ora.
- `template-attiva.php`: stesso HTML di `template-checkout.php`, senza WooCommerce.
- `uploads/girhouse/funnels/attiva.js` e `attiva.css`.
- Webhook di test `we_1UXoZlRpePwqv78HMnmXHKkI`. Costanti in `wp-config.php`: `GH_STRIPE_MODE = test`, `GH_STRIPE_TEST_WEBHOOK`, `GH_STRIPE_TEST_PUBLISHABLE` e `GH_STRIPE_TEST_SECRET`, le ultime due messe dal proprietario. `gh_billing_ready()` accetta solo chiavi che iniziano con `pk_test_` e `sk_test_` o `rk_test_`, quindi i segnaposto non passano.
- Dominio `girhouse.com` registrato per i portafogli anche in test (`pmd_1UXoryRpePwqv78Hy60lYI3y`): senza, Apple Pay e Google Pay non comparivano.
- Più abbonamenti attivi per la stessa persona sono ammessi. Di quelli ancora da pagare (carta rifiutata, pagina chiusa) uno con lo stesso importo si riusa, uno con importo diverso si annulla, così i tentativi non lasciano abbonamenti vuoti.
- Il Payment Element usa `terms: { card: 'never' }`: l'autorizzazione agli addebiti è la riga sotto il bottone, come nel checkout WooCommerce.
- Provato senza carte il 4 novembre: aspetto uguale al checkout WooCommerce su 1366×900 e 390×844 (sul telefono scadenza e CVC sono affiancati); errori in italiano a modulo vuoto; "Il numero della carta è incompleto" senza carta e senza chiamare il server; endpoint con abbonamento a 47 € e fonte fb-ads, funnel F1; secondo tentativo sullo stesso abbonamento; conferma "Stiamo confermando il pagamento" e "Link non valido"; webhook con firma giusta, sbagliata ed evento doppio. L'abbonamento di prova è stato annullato.
- Prova del proprietario con la carta 4242: abbonamento attivo, `invoice.paid` ricevuto, meta Stripe sull'utente WordPress 2, registro di cosa andrebbe a GHL. Pagati 97 € perché il timer `gh_offer` del suo browser era già scaduto (cookie di 30 giorni): comportamento previsto.
- **Apple Pay e Google Pay**: con Elements in modalità `subscription` Stripe usava la configurazione "Billing Payments" dell'account, che li ha spenti, e i pulsanti non comparivano. Ora Elements è in modalità `payment` con `setupFutureUsage: off_session` e `paymentMethodTypes: ['card','link']`, come WooCommerce e come il primo pagamento dell'abbonamento (`setup_future_usage: off_session`). Il proprietario li vede entrambi; il registro dice `applePay: true, googlePay: true`. Opzioni del pulsante rapido uguali a WooCommerce Stripe.
- In modalità test il browser manda a `/wp-json/gh-funnels/v1/attiva/diagnosi` cosa offre il pulsante rapido (riga "Pulsanti rapidi" nel registro). In live è spento.
- La barra di amministrazione di WordPress su `/attiva/` aveva perso lo stile perché il checkout toglieva tutti gli stili: ora `admin-bar` e `dashicons` restano.
- Il vecchio webhook F9 (`GH_FUNNEL_WEBHOOK`) non si chiama più: deciso dal proprietario il 4 novembre. Link resta nel modulo.
- L'abbonamento WPSubscription #21643 (ordine 21642, 47 €, carta 4242) è di prova, confermato dal proprietario: niente da spostare al passo 4.
- Pronto e controllato con `php -l`, non ancora attivo: `checkout.php` senza WooCommerce, `girhouse-funnels.php` senza correzione dei cookie di sessione e senza `wc-ajax`, `prenota.php` con il paese dall'IP chiesto direttamente a ipinfo.io (cache di un giorno), `billing.php` che avvia il primo pagamento dopo la risposta a Stripe invece che con Action Scheduler.
- Per andare live servono le costanti `GH_STRIPE_LIVE_PUBLISHABLE`, `GH_STRIPE_LIVE_SECRET` e `GH_STRIPE_LIVE_WEBHOOK`, messe dal proprietario. Poi prodotto, prezzo e coupon live, `GH_STRIPE_LIVE_PRICE` e `GH_STRIPE_LIVE_COUPON`, `GH_STRIPE_MODE = live` e `GH_BILLING_ON = true`.
- Backup prima delle modifiche: `~/backups-girhouse/20261104-pre-checkout-stripe/`.

## Primo passo

Controllare se il connettore Stripe è disponibile. Se c'è, creare in modalità test prodotto, prezzo e coupon e riportare gli id. Poi leggere `checkout.php` e `template-checkout.php` sul server prima di scrivere il nuovo checkout.
