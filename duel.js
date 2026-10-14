"use strict";
// Interfaccia online: profilo, classifica globale e sfide 1 contro 1.
// Usa le funzioni e lo stato globali di app.js e l'API window.OMG_ONLINE di online.js.
(function () {
  const O = () => window.OMG_ONLINE;
  const online = () => O() && O().ready && O().enabled;
  let unsubRoom = null, unsubGuesses = null, oppMarker = null, oppLine = null, started = false;

  function whenReady(fn) {
    if (O() && O().ready) fn(); else window.addEventListener("omg-online-ready", fn, { once: true });
  }
  function leaveDuel() {
    if (unsubRoom) { unsubRoom(); unsubRoom = null; }
    if (unsubGuesses) { unsubGuesses(); unsubGuesses = null; }
    state.duel = null; started = false; oppMarker = null; oppLine = null;
    $("duelBox").style.display = "none";
  }
  function setText(id, t) { $(id).textContent = t; }
  function providerReady() {
    if (state.provider === "mapillary" && !/^MLY\|/.test($("tokenInput").value.trim() || DEFAULT_MLY_TOKEN)) {
      setText("onlineHint", "Per Mapillary serve la tua chiave (campo nella home), oppure scegli Panoramax.");
      return false;
    }
    if (state.provider === "google" && !/^AIza/.test($("googleKeyInput").value.trim() || DEFAULT_GOOGLE_KEY)) {
      setText("onlineHint", "Per Google serve la tua chiave API (campo nella home).");
      return false;
    }
    return true;
  }

  // ---------- profilo ----------
  function renderProfile() {
    const p = O() && O().profile;
    if (!p) return;
    setText("pIcon", p.icon);
    setText("pName", p.name);
  }
  $("pReroll").addEventListener("click", () => { O().rerollProfile(); renderProfile(); });

  // ---------- personalizzazione profilo ----------
  let pickedIcon = null;
  function buildIconGrid() {
    $("iconGrid").replaceChildren(...O().icons.map((ic) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = ic;
      b.className = "icon-opt" + (ic === pickedIcon ? " on" : "");
      b.setAttribute("aria-label", "Icona " + ic);
      b.addEventListener("click", () => { pickedIcon = ic; buildIconGrid(); });
      return b;
    }));
  }
  $("pEdit").addEventListener("click", () => {
    const p = O().profile;
    $("nameInput").value = p.name;
    pickedIcon = p.icon;
    buildIconGrid();
    setText("editMsg", "");
    show("profileEdit");
  });
  $("saveProfileBtn").addEventListener("click", () => {
    try {
      O().setProfile({ name: $("nameInput").value, icon: pickedIcon });
      renderProfile();
      show("home");
    } catch (e) {
      setText("editMsg", e.message);
    }
  });
  $("cancelProfileBtn").addEventListener("click", () => show("home"));

  // ---------- ospite / accesso con Google ----------
  function renderAuth() {
    const btn = $("authBtn");
    if (!online()) { btn.hidden = true; setText("authHint", ""); return; }
    btn.hidden = false;
    btn.disabled = false;
    if (O().anonymous) {
      setText("authBtn", "Accedi con Google");
      setText("authHint", "Stai giocando come ospite: profilo e punteggi si cancellano dopo 14 giorni. Accedi per conservarli.");
    } else {
      setText("authBtn", "Esci");
      setText("authHint", "Accesso con Google attivo: profilo e punteggi vengono conservati.");
    }
  }
  $("authBtn").addEventListener("click", async () => {
    const btn = $("authBtn");
    btn.disabled = true;
    try {
      if (O().anonymous) await O().signInGoogle(); else await O().signOut();
    } catch (e) {
      const closed = e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request");
      setText("authHint", closed ? "Accesso annullato." : "Accesso con Google non riuscito. Riprova.");
    } finally {
      btn.disabled = false;
      renderProfile();
      if (!$("authHint").textContent.startsWith("Accesso annullato") && !$("authHint").textContent.startsWith("Accesso con Google non")) renderAuth();
    }
  });
  window.addEventListener("omg-auth-changed", () => { renderProfile(); renderAuth(); });

  // ---------- classifica ----------
  async function openBoard() {
    show("board");
    const list = $("boardList");
    list.replaceChildren();
    setText("boardMsg", "Carico la classifica…");
    try {
      const rows = await O().topScores();
      setText("boardMsg", rows.length ? "Miglior punteggio per giocatore" : "Ancora nessun punteggio: gioca una partita!");
      list.replaceChildren(...rows.map((r) => {
        const li = document.createElement("li");
        if (r.uid === O().uid) li.className = "me";
        const who = document.createElement("span"), pts = document.createElement("span");
        who.textContent = `${r.icon} ${r.name}`;
        pts.textContent = Number(r.total).toLocaleString("it-IT");
        li.append(who, pts);
        return li;
      }));
    } catch (e) {
      setText("boardMsg", "Impossibile caricare la classifica.");
    }
  }
  $("boardBtn").addEventListener("click", () => { if (online()) openBoard(); });
  $("boardBack").addEventListener("click", () => show("home"));

  // ---------- sfida 1 contro 1 ----------
  function openLobby(code) {
    leaveDuel();
    show("lobby");
    $("lobbyMenu").style.display = "block";
    $("lobbyWait").style.display = "none";
    setText("lobbyMsg", "");
    if (code) $("joinCode").value = code;
  }
  $("duelBtn").addEventListener("click", () => { if (online()) openLobby(); });
  $("lobbyBack").addEventListener("click", () => { leaveDuel(); show("home"); });

  $("createRoomBtn").addEventListener("click", async () => {
    if (!providerReady()) { setText("lobbyMsg", $("onlineHint").textContent); return; }
    const btn = $("createRoomBtn");
    btn.disabled = true;
    try {
      const spots = [];
      for (let i = 0; i < ROUNDS; i++) {
        setText("lobbyMsg", `Preparo la partita… posto ${i + 1}/${ROUNDS}`);
        spots.push(await findSpot(() => {}));
      }
      const code = await O().createRoom({ provider: state.provider, rule: state.rule, time: state.time, spots });
      $("lobbyMenu").style.display = "none";
      $("lobbyWait").style.display = "block";
      setText("roomCode", code);
      setText("lobbyStatus", "In attesa di un avversario…");
      started = false;
      unsubRoom = O().watchRoom(code, (room) => {
        if (room.guest && !started) {
          started = true;
          setText("lobbyStatus", `${room.guestIcon} ${room.guestName} è entrato!`);
          startDuel(code, room, "host");
        }
      });
    } catch (e) {
      setText("lobbyMsg", e.message || "Errore nella creazione della stanza.");
    } finally {
      btn.disabled = false;
    }
  });

  $("joinBtn").addEventListener("click", async () => {
    setText("lobbyMsg", "Entro nella stanza…");
    try {
      const { code, room } = await O().joinRoom($("joinCode").value);
      startDuel(code, room, "guest");
    } catch (e) {
      setText("lobbyMsg", e.message || "Impossibile entrare nella stanza.");
    }
  });

  $("copyLinkBtn").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?room=${$("roomCode").textContent}`;
    try { await navigator.clipboard.writeText(url); setText("copyLinkBtn", "Link copiato"); } catch (e) { setText("copyLinkBtn", url); }
  });

  function startDuel(code, room, role) {
    const opp = role === "host" ? { name: room.guestName, icon: room.guestIcon } : { name: room.hostName, icon: room.hostIcon };
    state.duel = { code, role, spots: room.spots, opp, oppGuesses: {} };
    state.provider = room.provider; state.rule = room.rule; state.time = room.time;
    state.round = 0; state.total = 0; state.results = []; state.prefetch = null;
    if (unsubGuesses) unsubGuesses();
    unsubGuesses = O().watchGuesses(code, (list) => {
      if (!state.duel) return;
      for (const g of list) if (g.uid !== O().uid) state.duel.oppGuesses[g.round] = g;
      renderOpponent();
      renderDuelSummary();
    });
    startRound();
  }

  // ---------- hook chiamati da app.js ----------
  window.onGuessSubmitted = function (km, pts) {
    if (!state.duel) return;
    const g = state.guess;
    O().submitGuess(state.duel.code, state.round, { lat: g ? g[0] : null, lng: g ? g[1] : null, km, pts }).catch(() => {});
  };

  function renderOpponent() {
    if (!state.duel || !oppLine || !$("result").classList.contains("active")) return;
    const d = state.duel, g = d.oppGuesses[state.round];
    if (!g) { oppLine.textContent = `${d.opp.icon} ${d.opp.name} sta ancora giocando…`; return; }
    oppLine.textContent = `${d.opp.icon} ${d.opp.name}: ${g.km == null ? "nessuna risposta" : fmtKm(g.km)} · ${g.pts.toLocaleString("it-IT")} pt`;
    if (g.lat != null && resultMap && !oppMarker) {
      oppMarker = L.circleMarker([g.lat, g.lng], { radius: 9, color: "#0D2B3E", weight: 3, fillColor: "#5CD0C8", fillOpacity: 1 }).addTo(resultMap);
    }
  }
  window.onRoundResult = function () {
    oppLine = $("oppLine");
    oppMarker = null;
    oppLine.textContent = "";
    if (state.duel) renderOpponent();
  };

  function duelTotals() {
    const d = state.duel;
    let opp = 0, done = 0;
    for (let r = 0; r < ROUNDS; r++) if (d.oppGuesses[r]) { opp += d.oppGuesses[r].pts; done++; }
    return { me: state.total, opp, done };
  }
  function renderDuelSummary() {
    if (!state.duel || !$("final").classList.contains("active")) return;
    const d = state.duel, t = duelTotals(), box = $("duelBox");
    box.style.display = "block";
    let verdict = "";
    if (t.done < ROUNDS) verdict = `In attesa che ${d.opp.name} finisca (${t.done}/${ROUNDS} round)…`;
    else verdict = t.me > t.opp ? "🏆 Hai vinto!" : t.me < t.opp ? "Hai perso, rivincita?" : "Pareggio!";
    box.textContent = "";
    const l1 = document.createElement("div"), l2 = document.createElement("div"), l3 = document.createElement("strong");
    l1.textContent = `${O().profile.icon} ${O().profile.name}: ${t.me.toLocaleString("it-IT")} pt`;
    l2.textContent = `${d.opp.icon} ${d.opp.name}: ${t.opp.toLocaleString("it-IT")} pt`;
    l3.textContent = verdict;
    box.append(l1, l2, l3);
  }
  window.onGameFinished = function () {
    if (state.duel) { renderDuelSummary(); return; }
    $("duelBox").style.display = "none";
    if (online() && state.total > 0) {
      O().submitScore(state.total, state.provider)
        .then(() => { const b = $("duelBox"); b.style.display = "block"; b.textContent = "Punteggio inviato alla classifica globale 🏆"; })
        .catch(() => {});
    }
  };

  $("againBtn").addEventListener("click", () => { leaveDuel(); });

  // ---------- avvio ----------
  setTimeout(() => {
    if (!(O() && O().ready)) setText("onlineHint", "Connessione online lenta o non disponibile: riprovo…");
  }, 8000);
  whenReady(() => {
    renderProfile();
    renderAuth();
    const ok = online();
    $("boardBtn").disabled = !ok;
    $("duelBtn").disabled = !ok;
    if (!ok) setText("onlineHint", "Online non configurato: classifica e sfide si attivano con Firebase (vedi README).");
    const room = new URLSearchParams(location.search).get("room");
    if (ok && room) openLobby(room.toUpperCase().slice(0, 5));
  });
})();
