# OpenMguesser

Gioco di geolocalizzazione nel browser: vieni lasciato in un posto casuale della Terra dentro una vista panoramica navigabile, cerchi indizi (lingua, segnali, vegetazione, architettura…) e provi a indovinare dove sei sulla mappa. Più ti avvicini, più punti ottieni.

Gratuito, senza account, senza backend: sono solo tre file statici (`index.html`, `app.js`, `style.css`).

> Progetto indipendente e originale. Non è affiliato a GeoGuessr e non ne usa codice, grafica, audio o dati.

## Funzionalità

- Vista panoramica a 360° in cui ti puoi muovere (oppure modalità **Fermo**, solo guardarsi attorno)
- Posti casuali in tutto il mondo, **mai in mare** (campionamento sulle terre emerse)
- 5 round per partita, timer opzionale (libero, 5 min, 2 min)
- Mappa di risposta OpenStreetMap, con linea tra la tua risposta e il posto reale
- Punteggio fino a 5.000 punti per round, record personale salvato nel browser
- Il round successivo viene cercato in background mentre giochi: dal 2° round l'attesa è minima
- Ottimizzato per telefono, tablet e desktop (touch, notch, orizzontale/verticale)

## Avvio rapido

Serve solo un browser moderno. Per via delle regole di OpenStreetMap sui tile (richiedono il Referer) e di Google sulle chiavi, **servi la cartella con un piccolo server locale** invece di aprire il file con doppio clic:

```bash
# con Node.js
npx serve .

# oppure con Python
python -m http.server 8000
```

Poi apri l'indirizzo mostrato (per esempio `http://localhost:3000` o `http://localhost:8000`).

## Fonti delle immagini

Si sceglie nella home, prima di giocare.

| Fonte | Chiave | Costo | Note |
|---|---|---|---|
| **Mapillary** (predefinita) | già inclusa, opzionale la tua | gratis | Molti panorami 360°, copertura migliore tra quelle aperte |
| **Panoramax** | nessuna | gratis | Aperta, comunità OpenStreetMap; copertura soprattutto europea, spesso foto non a 360° |
| **Google Street View** | la tua chiave | a tuo carico | Qualità e copertura migliori; vedi sotto |

### Mapillary: usare la tua chiave

Nel repository **non c'è nessuna chiave**. Ne servono una per Mapillary (gratuita) e, se vuoi, una per Google:

1. Vai su <https://www.mapillary.com/dashboard/developers> e registra un'applicazione.
2. Nei permessi spunta solo la **lettura dei dati pubblici**.
3. Copia il **Client Token** (inizia con `MLY|`, non Client ID né Secret).

Dove metterla, a scelta:

| Dove | Come | Quando |
|---|---|---|
| **Campo nella home** | incollala e gioca; resta solo nel tuo browser | ognuno può usare la propria |
| **`config.local.js`** | `window.OMG_CONFIG = { mapillaryToken: "MLY\|…" }` (file ignorato da git) | sviluppo in locale |
| **GitHub Secrets** | `MAPILLARY_TOKEN` e `GOOGLE_MAPS_KEY` in Settings → Secrets and variables → Actions | sito pubblicato su GitHub Pages |

Con i Secrets il workflow `.github/workflows/pages.yml` genera `config.js` al momento del deploy: la chiave non finisce mai nei file del repository né nella cronologia git.

> Nota: GitHub Pages serve file statici, quindi la chiave presente nel sito pubblicato è comunque visibile a chi apre gli strumenti del browser. I Client Token Mapillary e le chiavi Google Maps sono pensati per il browser: per Google limitala per referrer HTTP al tuo dominio. I Secrets servono a non pubblicarla nel repository.

### Google Street View: usare la tua chiave

1. Apri la [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials) e crea un progetto.
2. Abilita **Maps JavaScript API** e attiva la fatturazione (Google offre un credito mensile, ma i costi oltre quel limite sono tuoi).
3. Crea una chiave API e **limitala per referrer HTTP** al tuo dominio (per esempio `http://localhost:*` per i test).
4. Scegli **Google** nella home e incolla la chiave (inizia con `AIza`). Resta salvata solo nel tuo browser.

Nella vista Google vengono nascosti indirizzo e nomi delle strade, per non rivelare il posto.

## Come funziona

1. Si estrae un punto casuale uniforme sulla sfera e si scarta se cade in mare o in Antartide (confini Natural Earth 110m, testati con il punto-in-poligono).
2. Si cerca un'immagine vicina con l'API della fonte scelta (24 punti in parallelo; i panorami 360° sono preferiti).
3. Mostri il viewer; la risposta è un click sulla mappa.
4. Punteggio: `5000 · e^(−distanza_km / 2000)`; la distanza è calcolata con la formula di Haversine.

## Struttura

```
index.html   struttura delle schermate (home, gioco, risultato, fine)
style.css    tema scuro, layout responsive, regole per touch/mobile
app.js       logica: ricerca posti, viewer, mappe, punteggio
favicon.svg  icona
```

Librerie caricate da CDN con controllo di integrità (SRI): Leaflet 1.9.4 e MapillaryJS 4.1.2. Google Maps JS si carica solo se scegli la fonte Google.

## Pubblicazione gratuita (GitHub Pages)

1. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. In **Settings → Secrets and variables → Actions** aggiungi (opzionali) `MAPILLARY_TOKEN` e `GOOGLE_MAPS_KEY`.
3. A ogni push su `main` il workflow pubblica il sito su `https://<utente>.github.io/OpenMguesser/`.
4. Se usi Google, limita la chiave per referrer a quel dominio.

## Limiti noti

- **Copertura**: Mapillary e Panoramax sono collaborative. Deserti, tundra e molte zone di Africa e Asia centrale hanno poche o nessuna immagine; il gioco ripiega su un altro punto.
- **Tempi**: la ricerca di un posto può richiedere alcuni secondi (soprattutto il primo round).
- **Nessun multiplayer**: per ora si gioca da soli. Online e classifiche richiederebbero un backend.
- **Tile OpenStreetMap**: adatti a un uso personale o limitato; per traffico alto serve un provider di tile dedicato.

## Possibili sviluppi

- Modalità "indovina il paese" e serie di paesi
- Sfida del giorno con seed condiviso
- Classifica e partite online
- Selezione di regioni o continenti

## Crediti e licenze

- Immagini: [Mapillary](https://www.mapillary.com) (CC BY-SA 4.0), [Panoramax](https://panoramax.fr) (licenze aperte indicate per immagine), Google Street View (secondo i termini Google)
- Mappa: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- Terre emerse: [Natural Earth](https://www.naturalearthdata.com) (pubblico dominio)
- [Leaflet](https://leafletjs.com) (BSD-2), [MapillaryJS](https://github.com/mapillary/mapillary-js) (MIT)
