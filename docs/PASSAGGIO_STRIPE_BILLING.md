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

## Primo passo

Controllare se il connettore Stripe è disponibile. Se c'è, creare in modalità test prodotto, prezzo e coupon e riportare gli id. Poi leggere `checkout.php` e `template-checkout.php` sul server prima di scrivere il nuovo checkout.
