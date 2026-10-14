# Informativa sulla privacy di OpenMguesser

Ultimo aggiornamento: 14 ottobre 2026

OpenMguesser è un gioco gratuito e open source. Questa pagina spiega, in modo semplice, quali dati usa e per quanto tempo li conserva. Titolare del progetto: [emmesaux](https://github.com/emmesaux). Per domande o richieste sui tuoi dati apri una segnalazione su <https://github.com/emmesaux/OpenMguesser/issues>.

## In breve
- **Non devi registrarti** per giocare. Ti viene assegnato un nome casuale e un'icona.
- **Niente pubblicità, niente analytics, niente tracciamento.**
- I dati degli **ospiti** si cancellano dopo **14 giorni**.
- Se accedi con **Google**, i tuoi dati restano finché non li cancelli.

## Quali dati vengono trattati

### Sul tuo dispositivo (localStorage del browser)
- `omg-profile`: nome casuale e icona.
- `omg-best`: il tuo record personale.
- `omg-mly-token` e `omg-google-key`: **solo se le inserisci tu** nei campi della home. Restano sul tuo dispositivo e non vengono inviate al nostro database.

Puoi cancellarli in qualsiasi momento dalle impostazioni del browser.

### Nel database online (Firebase / Cloud Firestore)
Solo se la parte online è attiva:

| Dato | Contenuto | Conservazione |
|---|---|---|
| Identificativo utente | ID anonimo generato da Firebase (non è il tuo nome né la tua email) | finché l'account esiste |
| Profilo | nome (casuale o scelto da te, non inserire dati personali) e icona | ospiti: 14 giorni; con Google: fino a cancellazione |
| Punteggi | punteggio totale, fonte immagini, data | ospiti: 14 giorni; con Google: fino a cancellazione |
| Sfide 1 contro 1 | codice stanza, nomi/icone dei due giocatori, luoghi della partita, risposte (coordinate e punti) | 1 giorno |

### Accesso con Google (facoltativo)
Se scegli "Accedi con Google", Firebase Authentication riceve dal tuo account Google dati come email e nome. Questi dati **restano nel registro utenti del progetto Firebase**: non vengono mostrati agli altri giocatori né copiati nel database dei punteggi. Agli altri giocatori viene mostrato solo il nome e l'icona del profilo (casuali o scelti da te); la foto del tuo account Google non viene usata.

## Servizi di terze parti
Per funzionare, il gioco usa servizi esterni. Quando li usi, questi servizi ricevono almeno il tuo indirizzo IP e i dati tecnici della richiesta, secondo le loro informative:

- **Firebase / Google** (accesso, database): <https://policies.google.com/privacy>
- **Mapillary** (immagini stradali): <https://www.mapillary.com/privacy>
- **Panoramax** (immagini stradali aperte): <https://panoramax.fr>
- **Google Maps / Street View**, solo se scegli la fonte Google con la tua chiave: <https://policies.google.com/privacy>
- **OpenStreetMap** (mappa): <https://osmfoundation.org/wiki/Privacy_Policy>
- **Google Fonts** (caratteri Bricolage Grotesque e Figtree, caricati da fonts.googleapis.com e fonts.gstatic.com): <https://developers.google.com/fonts/faq/privacy>
- **jsDelivr, cdnjs, gstatic** (librerie e confini delle terre emerse caricati da CDN)
- **GitHub Pages** (hosting del sito): <https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement>

## Posizione
Il gioco **non** usa la tua posizione. Le coordinate che vedi e invii sono quelle del luogo da indovinare e della tua risposta sulla mappa.

## I tuoi diritti
Puoi chiedere l'accesso, la correzione o la cancellazione dei dati collegati al tuo account aprendo una segnalazione indicando il tuo nome casuale. Per gli ospiti basta aspettare la scadenza automatica. Svuotare i dati del browser rimuove le informazioni locali; il tuo identificativo anonimo non sarà più recuperabile e i dati online scadranno da soli.

## Sicurezza
L'accesso al database è limitato da regole di sicurezza pubbliche (`firestore.rules`). I punteggi sono calcolati dal tuo browser: non considerarli verificati.

## Modifiche
Questa informativa può cambiare con l'evoluzione del gioco. La data di aggiornamento è in cima alla pagina e la cronologia è visibile nella storia del repository.

> Nota: questo testo descrive in buona fede il funzionamento del progetto e non costituisce consulenza legale.
