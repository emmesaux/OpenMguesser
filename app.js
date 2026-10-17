"use strict";
// OpenMguesser: geolocalizzazione in un viewer panoramico navigabile.
// Immagini: Mapillary (CC BY-SA). Mappa: OpenStreetMap. Terraferma: Natural Earth (pubblico dominio).

const ROUNDS = 5;
const MAX_SCORE = 5000;
const SCORE_SCALE_KM = 2000; // più grande = punteggio più generoso su distanze lunghe
const GRAPH = "https://graph.mapillary.com/images";
const LAND_URL = "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_land.geojson";
const TOKEN_KEY = "omg-mly-token", GKEY_KEY = "omg-google-key", BEST_KEY = "omg-best";
// Chiavi predefinite: nessuna è scritta nel codice. Arrivano da config.js (generato dai
// secrets di GitHub in produzione) o da config.local.js (solo in locale, ignorato da git).
// Ognuno può comunque inserire la propria dal campo nella home.
const CFG = window.OMG_CONFIG || {};
const DEFAULT_MLY_TOKEN = CFG.mapillaryToken || "";
const DEFAULT_GOOGLE_KEY = CFG.googleKey || "";

const $ = (id) => document.getElementById(id);
const PMX = "https://api.panoramax.xyz/api";
const state = { provider: "mapillary", pack: "world", prefetch: null, duel: null, time: 0, rule: "move", round: 0, total: 0, results: [], current: null, guess: null, timer: null, locked: false };
let guessMap, guessMarker, resultMap, viewer, landPolys = null;

// ---------- utilità ----------
function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const scoreFor = (km) => Math.round(MAX_SCORE * Math.exp(-km / SCORE_SCALE_KM));
const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km).toLocaleString(loc())} km`);
const show = (id) => document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage non disponibile */ } },
};
const getToken = () => store.get(TOKEN_KEY) || DEFAULT_MLY_TOKEN;
const getGoogleKey = () => store.get(GKEY_KEY) || DEFAULT_GOOGLE_KEY;

// ---------- terraferma: punto casuale che non cade in mare ----------
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPoly(x, y, poly) {
  if (!inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false; // buchi (laghi interni)
  return true;
}
async function loadLand() {
  if (landPolys) return;
  const res = await fetch(LAND_URL);
  if (!res.ok) throw new Error(t("err.land"));
  const gj = await res.json();
  landPolys = [];
  for (const f of gj.features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const p of polys) {
      let minX = 180, maxX = -180, minY = 90, maxY = -90;
      for (const [x, y] of p[0]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      landPolys.push({ p, minX, maxX, minY, maxY });
    }
  }
}
function isLand(lon, lat) {
  for (const q of landPolys) {
    if (lon < q.minX || lon > q.maxX || lat < q.minY || lat > q.maxY) continue;
    if (inPoly(lon, lat, q.p)) return true;
  }
  return false;
}
function randomLandPoint() {
  // Uniforme sulla sfera, scartando il mare e l'Antartide (nessuna copertura utile).
  for (let i = 0; i < 5000; i++) {
    const lat = (Math.asin(2 * Math.random() - 1) * 180) / Math.PI;
    const lon = Math.random() * 360 - 180;
    if (lat > -58 && lat < 78 && isLand(lon, lat)) return [lat, lon];
  }
  return [48.85, 2.35];
}

// ---------- ricerca di un'immagine Mapillary ----------
// L'API accetta al massimo 0,01 gradi quadrati e rifiuta anche aree piccole se molto dense
// (errore 500 "reduce the amount of data"): si riprova con aree via via più piccole.
const BBOX_HALF_STEPS = [0.045, 0.01, 0.0025];
async function imagesAround([lat, lon], _half, pano) {
  for (const half of BBOX_HALF_STEPS) {
    const bbox = [lon - half, lat - half, lon + half, lat + half].map((n) => n.toFixed(5)).join(",");
    const p = new URLSearchParams({ access_token: getToken(), fields: "id,computed_geometry,is_pano", bbox, limit: "30" });
    if (pano) p.set("is_pano", "true");
    const res = await fetch(`${GRAPH}?${p}`, { signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error(t("err.mlyKey")), { fatal: true });
    if (res.ok) return parseImages(await res.json());
    let err = null;
    try { err = (await res.json()).error; } catch (e) { /* corpo non JSON */ }
    if (err && err.code === 190) throw Object.assign(new Error(t("err.mlyKey")), { fatal: true });
    // Altri errori (area troppo grande o troppo densa): riprova più piccolo.
  }
  return [];
}
function parseImages(data) {
  return (data.data || []).map((d) => {
    const g = d.computed_geometry || d.geometry;
    return g && g.coordinates ? { id: d.id, pos: [g.coordinates[1], g.coordinates[0]], pano: !!d.is_pano } : null;
  }).filter(Boolean);
}

// ---------- ricerca di un'immagine Panoramax (aperta, senza chiave) ----------
const linkOf = (f, rel) => (f.links || []).find((l) => l.rel === rel);
function pmxItem(f) {
  const col = linkOf(f, "collection");
  const prev = linkOf(f, "prev"), next = linkOf(f, "next");
  const idOf = (l) => (l && l.id) || null;
  return {
    provider: "panoramax", id: f.id, pos: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
    src: f.assets && f.assets.sd ? f.assets.sd.href : null,
    col: col ? col.href.split("/").pop() : null, prev: idOf(prev), next: idOf(next),
  };
}
async function pmxAround([lat, lon], half) {
  const bbox = [lon - half, lat - half, lon + half, lat + half].map((n) => n.toFixed(5)).join(",");
  const res = await fetch(`${PMX}/search?bbox=${bbox}&limit=40`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  // Teniamo solo immagini che fanno parte di una sequenza, così ci si può muovere.
  return (data.features || []).map(pmxItem).filter((it) => it.src && it.col && (it.prev || it.next));
}
async function pmxLoad(col, id) {
  const res = await fetch(`${PMX}/collections/${encodeURIComponent(col)}/items/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(t("err.imgUnavailable"));
  return pmxItem(await res.json());
}

// ---------- Google Street View (con la chiave dell'utente) ----------
let googleLoading = null;
function loadGoogle(key) {
  if (window.google && window.google.maps && window.google.maps.StreetViewService) return Promise.resolve();
  if (googleLoading) return googleLoading;
  googleLoading = new Promise((resolve, reject) => {
    window.__omgGoogleReady = () => resolve();
    window.gm_authFailure = () => {
      googleLoading = null;
      $("viewerMsg").style.display = "block";
      $("viewerMsg").textContent = t("err.googleAuth");
      reject(Object.assign(new Error(t("err.googleKey")), { fatal: true }));
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=__omgGoogleReady`;
    s.async = true;
    s.onerror = () => { googleLoading = null; reject(Object.assign(new Error(t("err.googleLoad")), { fatal: true })); };
    document.head.append(s);
  });
  return googleLoading;
}
function googlePanoNear([lat, lon]) {
  const sv = new google.maps.StreetViewService();
  return new Promise((resolve) => {
    sv.getPanorama({
      location: { lat, lng: lon }, radius: curatedPack() ? 800 : 50000, // luoghi precisi: cerca vicino
      source: google.maps.StreetViewSource.OUTDOOR, // solo Street View ufficiale all'aperto
      preference: google.maps.StreetViewPreference.NEAREST,
    }, (data, status) => {
      if (status !== google.maps.StreetViewStatus.OK || !data || !data.location) return resolve([]);
      // OUTDOOR include anche le foto sferiche degli utenti (drone, sentieri, interni di edifici):
      // tengo solo il Street View ufficiale, che ha il copyright di Google.
      if (!/google/i.test(data.copyright || "")) return resolve([]);
      const ll = data.location.latLng;
      resolve([{ provider: "google", pano: true, id: data.location.pano, pos: [ll.lat(), ll.lng()] }]);
    });
  });
}

// ---------- mappe di gioco: da dove si estraggono i punti ----------
const curatedPack = () => state.pack === "capitals" || state.pack === "landmarks";
// Restituisce [lat, lon, nomeIT?, nomeEN?]. Capitali e luoghi famosi: punto dell'elenco con piccola variazione (circa 3 km).
function randomSpotPoint() {
  const P = window.PACKS || {};
  if (curatedPack() && Array.isArray(P[state.pack]) && P[state.pack].length) {
    const c = P[state.pack][Math.floor(Math.random() * P[state.pack].length)];
    const j = () => (Math.random() - 0.5) * 0.06;
    return [c[0] + j(), c[1] + j(), c[2], c[3]];
  }
  const r = P.regions && P.regions[state.pack];
  if (r) {
    for (let i = 0; i < 5000; i++) {
      const lat = r[0] + Math.random() * (r[2] - r[0]), lon = r[1] + Math.random() * (r[3] - r[1]);
      if (isLand(lon, lat)) return [lat, lon];
    }
  }
  return randomLandPoint();
}
function spotLabel(lbl) {
  if (!lbl) return "";
  if (typeof lbl === "object") return lbl[getLang()] || lbl.it || "";
  return String(lbl);
}

// ---------- scelta del posto ----------
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const quiet = (p) => p.catch((e) => { if (e.fatal) throw e; return []; });

async function findSpot(onProgress) {
  await loadLand();
  if (state.provider === "google") await loadGoogle(getGoogleKey());
  // Molti punti in parallelo e subito qualsiasi immagine: i panorami 360° vengono preferiti
  // tra quelli trovati, ma non si aspetta più di un giro di richieste per trovarli.
  const PER_BATCH = state.provider === "google" ? 10 : state.provider === "mapillary" ? 24 : 16;
  for (let batch = 0; batch < 8; batch++) {
    onProgress(batch);
    const pts = Array.from({ length: PER_BATCH }, randomSpotPoint);
    const search = state.provider === "panoramax" ? (pt) => pmxAround(pt, 0.05)
      : state.provider === "google" ? googlePanoNear
        : (pt) => imagesAround(pt, 0.05, false);
    // Il nome del luogo (capitali, luoghi famosi) si mostra solo dopo la risposta.
    const hits = (await Promise.all(pts.map(async (pt) => {
      const label = pt[2] ? (pt[3] ? { it: pt[2], en: pt[3] } : pt[2]) : null;
      return (await quiet(search(pt))).map((h) => ({ ...h, label }));
    }))).flat();
    if (hits.length) {
      const panos = hits.filter((h) => h.pano);
      return pick(panos.length ? panos : hits);
    }
  }
  throw new Error(t("err.noSpot"));
}

// ---------- mappe (con nomi in italiano o inglese in base alla lingua scelta) ----------
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
let rawMapStyle = null, mapStyleProm = null;
const activeGlLayers = new Set();

function mapLabelExpr(lang) {
  return lang === "it"
    ? ["coalesce", ["get", "name:it"], ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]]
    : ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name:it"], ["get", "name"]];
}
function isLocalizedSymbolLayer(l) {
  const tf = l && l.type === "symbol" && l.layout && l.layout["text-field"];
  return Array.isArray(tf) && !l.id.includes("shield");
}
function buildLocalizedStyle(raw, lang) {
  const s = JSON.parse(JSON.stringify(raw));
  const expr = mapLabelExpr(lang);
  for (const l of s.layers || []) {
    if (isLocalizedSymbolLayer(l)) l.layout["text-field"] = expr;
  }
  return s;
}
function fetchMapStyle() {
  if (rawMapStyle) return Promise.resolve(rawMapStyle);
  if (!mapStyleProm) {
    mapStyleProm = fetch(MAP_STYLE_URL).then((r) => {
      if (!r.ok) throw new Error("style");
      return r.json();
    }).then((s) => { rawMapStyle = s; return s; }).catch((e) => { mapStyleProm = null; throw e; });
  }
  return mapStyleProm;
}
fetchMapStyle().catch(() => {});

function addBaseTiles(map) {
  const fallback = () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: OSM_ATTR }).addTo(map);
  if (typeof L.maplibreGL !== "function") return fallback();
  const mount = (raw) => {
    if (!map._container) return;
    try {
      const layer = L.maplibreGL({
        style: buildLocalizedStyle(raw, getLang()),
        attribution: `<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ${OSM_ATTR}`,
      }).addTo(map);
      activeGlLayers.add(layer);
      map.on("unload", () => activeGlLayers.delete(layer));
    } catch (e) {
      fallback();
    }
  };
  if (rawMapStyle) mount(rawMapStyle);
  else fetchMapStyle().then(mount).catch(fallback);
}

function syncMapSize(map) {
  if (!map) return;
  map.invalidateSize();
  activeGlLayers.forEach((l) => {
    if (l._map === map && l._glMap) l._update();
  });
}

function updateMapLanguage() {
  const expr = mapLabelExpr(getLang());
  activeGlLayers.forEach((l) => {
    const gl = l._glMap;
    if (!gl) return;
    const apply = () => {
      const s = gl.getStyle();
      if (!s || !s.layers) return;
      for (const lay of s.layers) {
        if (isLocalizedSymbolLayer(lay)) {
          try { gl.setLayoutProperty(lay.id, "text-field", expr); } catch (e) { /* ok */ }
        }
      }
    };
    if (gl.isStyleLoaded()) apply(); else gl.once("styledata", apply);
  });
}

function initGuessMap() {
  if (guessMap) { guessMap.setView([20, 0], 1); return; }
  guessMap = L.map("guessMap", { worldCopyJump: true, minZoom: 1 }).setView([20, 0], 1);
  addBaseTiles(guessMap);
  guessMap.on("click", (e) => {
    if (state.locked) return;
    state.guess = [e.latlng.lat, e.latlng.lng];
    if (guessMarker) guessMarker.setLatLng(e.latlng); else guessMarker = L.marker(e.latlng).addTo(guessMap);
    $("guessBtn").disabled = false;
  });
  // Col mouse la mappa si allarga al passaggio; col tocco si apre/chiude con il pulsante.
  const panel = $("guessPanel");
  if (canHover) {
    panel.addEventListener("mouseenter", () => setPanelOpen(true));
    panel.addEventListener("mouseleave", () => { if (!panelPinned) setPanelOpen(false); });
  } else {
    panel.classList.add("touch");
  }
  panel.addEventListener("transitionend", () => syncMapSize(guessMap));
  $("mapToggle").addEventListener("click", () => {
    panelPinned = !panel.classList.contains("small") ? false : true;
    setPanelOpen(panelPinned);
  });
  window.addEventListener("resize", () => syncMapSize(guessMap));
}

const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
let panelPinned = false;
function setPanelOpen(open) {
  const panel = $("guessPanel");
  panel.classList.toggle("small", !open);
  const tg = $("mapToggle");
  tg.textContent = open ? t("map.close") : (canHover ? t("map.desk") : t("map.touch"));
  tg.setAttribute("aria-expanded", String(open));
  setTimeout(() => syncMapSize(guessMap), 220);
}

// ---------- viewer panoramico ----------
function closeViewer() {
  if (viewer) {
    try { if (typeof viewer.remove === "function") viewer.remove(); else viewer.setVisible(false); } catch (e) { /* già rimosso */ }
    viewer = null;
  }
  $("viewer").replaceChildren();
}

// Viewer Google Street View: tolti indirizzo, nomi delle strade e controlli che rivelano il posto.
function openGoogle(spot) {
  closeViewer();
  const move = state.rule === "move";
  viewer = new google.maps.StreetViewPanorama($("viewer"), {
    pano: spot.id,
    addressControl: false, showRoadLabels: false, fullscreenControl: false,
    enableCloseButton: false, motionTracking: false, zoomControl: true, panControl: true,
    linksControl: move, clickToGo: move,
  });
}

// Viewer per immagini Panoramax: foto a tutto schermo + navigazione lungo la sequenza.
function openPanoramax(item) {
  closeViewer();
  const box = $("viewer");
  const img = document.createElement("img");
  img.className = "pmx-img";
  img.alt = t("game.where");
  img.referrerPolicy = "no-referrer";
  box.append(img);
  const show = (it) => { state.cursor = it; img.src = it.src; if (prevBtn) prevBtn.disabled = !it.prev; if (nextBtn) nextBtn.disabled = !it.next; };
  let prevBtn = null, nextBtn = null;
  if (state.rule === "move") {
    const nav = document.createElement("div");
    nav.className = "pmx-nav";
    const mk = (label, key) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", async () => {
        const id = state.cursor[key];
        if (!id) return;
        prevBtn.disabled = nextBtn.disabled = true;
        try { show(await pmxLoad(state.cursor.col, id)); } catch (e) { show(state.cursor); }
      });
      return b;
    };
    prevBtn = mk(t("nav.back"), "prev");
    nextBtn = mk(t("nav.fwd"), "next");
    nav.append(prevBtn, nextBtn);
    box.append(nav);
  }
  show(item);
}

function openViewer(spot) {
  if (spot.provider === "panoramax") return openPanoramax(spot);
  if (spot.provider === "google") return openGoogle(spot);
  const imageId = spot.id;
  const move = state.rule === "move";
  const opts = {
    accessToken: getToken(), container: "viewer", imageId,
    component: { cover: false, attribution: true, sequence: move, direction: move, zoom: true, bearing: false },
  };
  closeViewer();
  viewer = new mapillary.Viewer(opts);
  if (!move) {
    // Nessun movimento: si può solo guardarsi attorno.
    try { viewer.deactivateComponent("sequence"); viewer.deactivateComponent("direction"); } catch (e) { /* ok */ }
  }
}

// ---------- flusso di gioco ----------
async function startRound() {
  state.locked = false; state.guess = null; state.current = null;
  $("guessBtn").disabled = true;
  if (guessMarker) { guessMarker.remove(); guessMarker = null; }
  show("game");
  initGuessMap();
  panelPinned = false;
  setPanelOpen(false);
  setTimeout(() => syncMapSize(guessMap), 60);
  $("roundLbl").textContent = t("game.round", { n: state.round + 1, max: ROUNDS });
  renderPips();
  $("scoreLbl").textContent = t("game.pts", { n: state.total.toLocaleString(loc()) });
  $("timerLbl").textContent = "";
  const msg = $("viewerMsg");
  msg.style.display = "block";
  msg.textContent = t("game.finding");
  try {
    // Il posto del round è già pronto se è stato cercato mentre giocavi il precedente.
    if (state.duel) {
      // Sfida 1 contro 1: i posti sono quelli scelti dall'ospitante, uguali per entrambi.
      state.current = state.duel.spots[state.round];
      if (state.current.provider === "google") await loadGoogle(getGoogleKey());
    } else {
      const ready = state.prefetch;
      state.prefetch = null;
      state.current = ready
        ? await ready
        : await findSpot((n) => { msg.textContent = n ? t("game.findingN", { n: n + 1 }) : t("game.finding"); });
    }
  } catch (e) {
    msg.textContent = e.message;
    if (e.fatal) setTimeout(() => show("home"), 2500);
    return;
  }
  openViewer(state.current);
  msg.style.display = "none";
  startTimer();
  // Prepara il round successivo in background mentre si gioca questo.
  if (!state.duel && state.round + 1 < ROUNDS) {
    state.prefetch = findSpot(() => {});
    state.prefetch.catch(() => { state.prefetch = null; });
  }
}

function startTimer() {
  clearInterval(state.timer);
  if (!state.time) return;
  let left = state.time;
  const tick = () => {
    $("timerLbl").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (left-- <= 0) { clearInterval(state.timer); submitGuess(true); }
  };
  tick();
  state.timer = setInterval(tick, 1000);
}

function submitGuess(timeout) {
  if (state.locked || !state.current) return;
  state.locked = true;
  clearInterval(state.timer);
  const target = state.current.pos;
  const km = state.guess ? haversineKm(state.guess, target) : null;
  const pts = km === null ? 0 : scoreFor(km);
  state.total += pts;
  state.results.push({ km, pts });
  if (typeof onGuessSubmitted === "function") onGuessSubmitted(km, pts);
  showResult(target, km, pts, timeout);
}

function showResult(target, km, pts, timeout) {
  closeViewer();
  show("result");
  $("resTitle").textContent = t("res.points", { n: pts.toLocaleString(loc()) });
  $("resDetail").textContent = km === null
    ? (timeout ? t("res.timeout") : t("res.none"))
    : t("res.distance", { d: fmtKm(km) });
  const label = spotLabel(state.current && state.current.label);
  $("resPlace").textContent = label ? t("res.near", { name: label }) : "";
  $("nextBtn").textContent = state.round + 1 >= ROUNDS ? t("res.see") : t("res.next");
  if (resultMap) resultMap.remove();
  resultMap = L.map("resultMap", { worldCopyJump: true }).setView(target, 3);
  addBaseTiles(resultMap);
  L.circleMarker(target, { radius: 10, color: "#0D2B3E", weight: 3, fillColor: "#FFC247", fillOpacity: 1 }).addTo(resultMap);
  const pts2 = [target];
  if (state.guess) {
    L.marker(state.guess).addTo(resultMap);
    L.polyline([state.guess, target], { color: "#D92E47", weight: 3, dashArray: "6 9" }).addTo(resultMap);
    pts2.push(state.guess);
  }
  setTimeout(() => { syncMapSize(resultMap); resultMap.fitBounds(L.latLngBounds(pts2).pad(0.4), { maxZoom: 12 }); }, 60);
  if (typeof onRoundResult === "function") onRoundResult(target);
}

// Indicatori dei round: pieni quelli già giocati, evidenziato il corrente.
function renderPips() {
  $("pips").replaceChildren(...Array.from({ length: ROUNDS }, (_, i) => {
    const s = document.createElement("i");
    s.className = i < state.round ? "done" : i === state.round ? "now" : "";
    return s;
  }));
}

// Il totale sale fino al valore finale; senza animazione se l'utente la disattiva.
function countUp(el, to) {
  if (!to || matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = to.toLocaleString(loc()); return; }
  const t0 = performance.now(), D = 900;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / D);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString(loc());
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function nextRound() {
  state.round++;
  if (state.round >= ROUNDS) return finish();
  startRound();
}

function finish() {
  show("final");
  countUp($("finalScore"), state.total);
  // Ogni riga mostra una barra proporzionale ai punti del round (sul massimo possibile).
  $("finalList").replaceChildren(...state.results.map((r, i) => {
    const li = document.createElement("li"), rn = document.createElement("span"), rv = document.createElement("span");
    const bar = document.createElement("span"), fill = document.createElement("i");
    rn.className = "rn"; rn.textContent = t("final.round", { n: i + 1 });
    rv.className = "rv";
    rv.textContent = t("final.row", { d: r.km === null ? t("final.noAnswer") : fmtKm(r.km), n: r.pts.toLocaleString(loc()) });
    bar.className = "bar";
    fill.style.width = `${Math.round((r.pts / MAX_SCORE) * 100)}%`;
    bar.append(fill);
    li.append(rn, rv, bar);
    return li;
  }));
  try {
    if (state.total > Number(localStorage.getItem(BEST_KEY) || 0)) localStorage.setItem(BEST_KEY, String(state.total));
  } catch (e) { /* storage non disponibile */ }
  if (typeof onGameFinished === "function") onGameFinished();
}

function begin() {
  state.prefetch = null;
  state.duel = null;
  if (state.provider === "mapillary") {
    // Campo opzionale se il sito ha già una chiave predefinita (da config), altrimenti obbligatorio.
    const token = $("tokenInput").value.trim() || DEFAULT_MLY_TOKEN;
    if (!/^MLY\|/.test(token)) {
      $("tokenInput").focus();
      $("bestLine").textContent = t("val.mly");
      return;
    }
    store.set(TOKEN_KEY, $("tokenInput").value.trim());
  }
  if (state.provider === "google") {
    const key = $("googleKeyInput").value.trim() || DEFAULT_GOOGLE_KEY;
    if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(key)) {
      $("googleKeyInput").focus();
      $("bestLine").textContent = t("val.google");
      return;
    }
    store.set(GKEY_KEY, $("googleKeyInput").value.trim());
  }
  state.round = 0; state.total = 0; state.results = [];
  startRound();
}

// ---------- UI ----------
function bindSeg(id, attr, key, parse) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $(id).querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    state[key] = parse(b.dataset[attr]);
  });
}
bindSeg("providerSeg", "provider", "provider", String);
$("providerSeg").addEventListener("click", () => {
  $("tokenBox").style.display = state.provider === "mapillary" ? "block" : "none";
  $("googleBox").style.display = state.provider === "google" ? "block" : "none";
  $("bestLine").textContent = "";
});
bindSeg("packRow", "pack", "pack", String);
$("packRow").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  $("packRow").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
});
bindSeg("timeSeg", "time", "time", Number);
bindSeg("ruleSeg", "rule", "rule", String);
$("startBtn").addEventListener("click", begin);
$("guessBtn").addEventListener("click", () => submitGuess(false));
$("nextBtn").addEventListener("click", nextRound);
$("againBtn").addEventListener("click", () => { show("home"); renderHome(); });
$("shareBtn").addEventListener("click", async () => {
  const txt = t("final.share", { n: state.total.toLocaleString(loc()), r: ROUNDS });
  try { await navigator.clipboard.writeText(txt); $("shareBtn").textContent = t("final.copied"); } catch (e) { $("shareBtn").textContent = txt; }
});
function renderHome() {
  // Mostra solo la chiave personale (non quella predefinita).
  $("tokenInput").value = store.get(TOKEN_KEY);
  $("googleKeyInput").value = getGoogleKey();
  try {
    const b = Number(localStorage.getItem(BEST_KEY) || 0);
    $("bestLine").textContent = b ? t("home.best", { n: b.toLocaleString(loc()) }) : "";
  } catch (e) { /* ignora */ }
}
renderHome();

// Fonte predefinita: Google se è disponibile una chiave (del sito o personale), altrimenti Mapillary.
function applyDefaultProvider() {
  state.provider = DEFAULT_GOOGLE_KEY || getGoogleKey() ? "google" : "mapillary";
  document.querySelectorAll("#providerSeg button").forEach((b) => b.classList.toggle("on", b.dataset.provider === state.provider));
  $("tokenBox").style.display = state.provider === "mapillary" ? "block" : "none";
  $("googleBox").style.display = state.provider === "google" ? "block" : "none";
}
applyDefaultProvider();

// Cambio lingua: ridisegna i testi costruiti dal codice e aggiorna la lingua della mappa.
window.addEventListener("omg-lang-changed", () => {
  renderHome();
  setPanelOpen(!$("guessPanel").classList.contains("small"));
  updateMapLanguage();
  if ($("result").classList.contains("active") && state.current) {
    const label = spotLabel(state.current.label);
    $("resPlace").textContent = label ? t("res.near", { name: label }) : "";
  }
});
