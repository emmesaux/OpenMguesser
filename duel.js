"use strict";
// Interfaccia online: profilo, impostazioni account, classifica globale e sfide 1 contro 1.
// Usa le funzioni e lo stato globali di app.js e l'API window.OMG_ONLINE di online.js.
(function () {
  const O = () => window.OMG_ONLINE;
  const online = () => O() && O().ready && O().enabled;
  let unsubRoom = null, unsubGuesses = null, oppMarker = null, oppLine = null, started = false;
  let hintKey = "";

  function whenReady(fn) {
    if (O() && O().ready) fn(); else window.addEventListener("omg-online-ready", fn, { once: true });
  }
  function leaveDuel() {
    if (unsubRoom) { unsubRoom(); unsubRoom = null; }
    if (unsubGuesses) { unsubGuesses(); unsubGuesses = null; }
    state.duel = null; started = false; oppMarker = null; oppLine = null;
    $("duelBox").style.display = "none";
  }
  const setText = (id, s) => { $(id).textContent = s; };
  // Messaggio sotto i pulsanti della home: si ritraduce al cambio lingua.
  function hint(key) { hintKey = key; setText("onlineHint", key ? t(key) : ""); }

  function providerReady() {
    if (state.provider === "mapillary" && !/^MLY\|/.test($("tokenInput").value.trim() || DEFAULT_MLY_TOKEN)) {
      hint("on.needMly");
      return false;
    }
    if (state.provider === "google" && !/^AIza/.test($("googleKeyInput").value.trim() || DEFAULT_GOOGLE_KEY)) {
      hint("on.needGoogle");
      return false;
    }
    return true;
  }

  // ---------- profilo ----------
  // Il profilo si mostra subito dal browser; non serve aspettare che l'online sia pronto.
  function localProfile() {
    try {
      const p = JSON.parse(localStorage.getItem("omg-profile") || "null");
      if (p && p.name && p.icon) return p;
    } catch (e) { /* profilo non leggibile */ }
    return null;
  }
  function renderProfile() {
    const p = (O() && O().profile) || localProfile();
    if (!p) return;
    setText("pIcon", p.icon);
    setText("pName", p.name);
  }
  renderProfile();

  // ---------- accesso con Google (in alto) ----------
  function renderAuth() {
    const top = $("topAuthBtn"), badge = $("pBadge");
    if (!online()) { top.hidden = true; badge.hidden = true; return; }
    const guest = O().anonymous;
    top.hidden = false;
    top.disabled = false;
    setText("topAuthBtn", guest ? t("top.signin") : t("top.account"));
    // Etichetta breve accanto al nome; la spiegazione completa sta nel tooltip e nelle impostazioni.
    badge.hidden = false;
    badge.textContent = guest ? t("badge.guest") : t("badge.google");
    badge.className = "badge " + (guest ? "guest" : "google");
    badge.title = guest ? t("set.guest") : t("set.google");
  }
  async function doSignIn(btn, msgId) {
    btn.disabled = true;
    try {
      await O().signInGoogle();
      setText(msgId, "");
    } catch (e) {
      const closed = e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request");
      setText(msgId, closed ? t("auth.cancelled") : t("auth.failed"));
    } finally {
      btn.disabled = false;
      renderProfile();
      renderAuth();
      renderSettings();
    }
  }
  $("topAuthBtn").addEventListener("click", () => {
    if (O().anonymous) doSignIn($("topAuthBtn"), "authHint"); else openSettings();
  });
  window.addEventListener("omg-auth-changed", () => { renderProfile(); renderAuth(); renderSettings(); });

  // ---------- impostazioni ----------
  let pickedIcon = null;
  function buildIconGrid() {
    $("iconGrid").replaceChildren(...O().icons.map((ic) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = ic;
      b.className = "icon-opt" + (ic === pickedIcon ? " on" : "");
      b.setAttribute("aria-label", ic);
      b.addEventListener("click", () => { pickedIcon = ic; buildIconGrid(); });
      return b;
    }));
  }
  function renderSettings() {
    const on = online();
    $("accAuthBtn").hidden = !on;
    $("deleteBox").hidden = !on;
    if (!on) { setText("accountStatus", t("set.offline")); return; }
    if (O().anonymous) {
      setText("accountStatus", t("set.guest"));
      setText("accAuthBtn", t("set.signin"));
    } else {
      setText("accountStatus", O().email ? t("set.googleAs", { email: O().email }) : t("set.google"));
      setText("accAuthBtn", t("set.signout"));
    }
  }
  function openSettings() {
    if (!O()) return;
    const p = O().profile;
    $("nameInput").value = p.name;
    pickedIcon = p.icon;
    buildIconGrid();
    setText("editMsg", "");
    setText("deleteMsg", "");
    $("deleteConfirm").hidden = true;
    $("deleteBtn").hidden = false;
    renderSettings();
    show("profileEdit");
  }
  $("pEdit").addEventListener("click", openSettings);  $("rerollBtn").addEventListener("click", () => {
    if (!O()) return;
    const p = O().rerollProfile();
    $("nameInput").value = p.name;
    pickedIcon = p.icon;
    buildIconGrid();
    renderProfile();
  });
  $("saveProfileBtn").addEventListener("click", () => {
    try {
      O().setProfile({ name: $("nameInput").value, icon: pickedIcon });
      renderProfile();
      setText("editMsg", t("set.saved"));
    } catch (e) {
      setText("editMsg", e.message);
    }
  });
  $("cancelProfileBtn").addEventListener("click", () => show("home"));

  $("accAuthBtn").addEventListener("click", async () => {
    const btn = $("accAuthBtn");
    if (O().anonymous) { await doSignIn(btn, "deleteMsg"); return; }
    btn.disabled = true;
    try { await O().signOut(); setText("deleteMsg", ""); } catch (e) { setText("deleteMsg", t("auth.failed")); }
    btn.disabled = false;
    renderProfile(); renderAuth(); renderSettings();
    openSettings();
  });

  // Eliminazione: due passaggi (richiesta e conferma), sempre dentro la pagina.
  $("deleteBtn").addEventListener("click", () => {
    $("deleteBtn").hidden = true;
    $("deleteConfirm").hidden = false;
    setText("deleteMsg", "");
  });
  $("deleteNo").addEventListener("click", () => {
    $("deleteConfirm").hidden = true;
    $("deleteBtn").hidden = false;
  });
  $("deleteYes").addEventListener("click", async () => {
    const yes = $("deleteYes");
    yes.disabled = true;
    try {
      await O().deleteAccount();
      $("deleteConfirm").hidden = true;
      $("deleteBtn").hidden = false;
      setText("deleteMsg", t("set.deleted"));
      $("nameInput").value = O().profile.name;
      pickedIcon = O().profile.icon;
      buildIconGrid();
    } catch (e) {
      const closed = e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request");
      setText("deleteMsg", closed ? t("auth.cancelled") : t("set.deleteFail"));
    } finally {
      yes.disabled = false;
      renderProfile(); renderAuth(); renderSettings();
    }
  });

  // ---------- classifica ----------
  async function openBoard() {
    show("board");
    const list = $("boardList");
    list.replaceChildren();
    setText("boardMsg", t("board.loading"));
    try {
      const rows = await O().topScores();
      setText("boardMsg", rows.length ? t("board.sub") : t("board.empty"));
      list.replaceChildren(...rows.map((r) => {
        const li = document.createElement("li");
        if (r.uid === O().uid) li.className = "me";
        const who = document.createElement("span"), pts = document.createElement("span");
        who.textContent = `${r.icon} ${r.name}`;
        pts.textContent = Number(r.total).toLocaleString(loc());
        li.append(who, pts);
        return li;
      }));
    } catch (e) {
      setText("boardMsg", t("board.error"));
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
        setText("lobbyMsg", t("lobby.preparing", { n: i + 1, max: ROUNDS }));
        spots.push(await findSpot(() => {}));
      }
      const code = await O().createRoom({ provider: state.provider, rule: state.rule, time: state.time, spots });
      $("lobbyMenu").style.display = "none";
      $("lobbyWait").style.display = "block";
      setText("lobbyMsg", "");
      setText("roomCode", code);
      setText("lobbyStatus", t("lobby.waiting"));
      started = false;
      unsubRoom = O().watchRoom(code, (room) => {
        if (room.guest && !started) {
          started = true;
          setText("lobbyStatus", t("lobby.joined", { who: `${room.guestIcon} ${room.guestName}` }));
          startDuel(code, room, "host");
        }
      });
    } catch (e) {
      setText("lobbyMsg", e.message || t("lobby.errCreate"));
    } finally {
      btn.disabled = false;
    }
  });

  $("joinBtn").addEventListener("click", async () => {
    setText("lobbyMsg", t("lobby.joining"));
    try {
      const { code, room } = await O().joinRoom($("joinCode").value);
      startDuel(code, room, "guest");
    } catch (e) {
      setText("lobbyMsg", e.message || t("lobby.errJoin"));
    }
  });

  $("copyLinkBtn").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?room=${$("roomCode").textContent}`;
    try { await navigator.clipboard.writeText(url); setText("copyLinkBtn", t("lobby.copied")); } catch (e) { setText("copyLinkBtn", url); }
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
    const d = state.duel, g = d.oppGuesses[state.round], who = `${d.opp.icon} ${d.opp.name}`;
    if (!g) { oppLine.textContent = t("duel.playing", { who }); return; }
    oppLine.textContent = t("duel.oppRow", {
      who, d: g.km == null ? t("duel.noAnswer") : fmtKm(g.km), n: g.pts.toLocaleString(loc()),
    });
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
    const d = state.duel, tot = duelTotals(), box = $("duelBox");
    box.style.display = "block";
    let verdict = "";
    if (tot.done < ROUNDS) verdict = t("duel.wait", { name: d.opp.name, done: tot.done, max: ROUNDS });
    else verdict = tot.me > tot.opp ? t("duel.win") : tot.me < tot.opp ? t("duel.lose") : t("duel.draw");
    box.textContent = "";
    const l1 = document.createElement("div"), l2 = document.createElement("div"), l3 = document.createElement("strong");
    l1.textContent = t("duel.row", { who: `${O().profile.icon} ${O().profile.name}`, n: tot.me.toLocaleString(loc()) });
    l2.textContent = t("duel.row", { who: `${d.opp.icon} ${d.opp.name}`, n: tot.opp.toLocaleString(loc()) });
    l3.textContent = verdict;
    box.append(l1, l2, l3);
  }
  window.onGameFinished = function () {
    if (state.duel) { renderDuelSummary(); return; }
    $("duelBox").style.display = "none";
    if (online() && state.total > 0) {
      O().submitScore(state.total, state.provider)
        .then(() => { const b = $("duelBox"); b.style.display = "block"; b.textContent = t("duel.sent"); })
        .catch(() => {});
    }
  };

  $("againBtn").addEventListener("click", () => { leaveDuel(); });

  // ---------- avvio ----------
  setTimeout(() => { if (!(O() && O().ready)) hint("on.slow"); }, 8000);
  whenReady(() => {
    renderProfile();
    renderAuth();
    renderSettings();
    const ok = online();
    $("boardBtn").disabled = !ok;
    $("duelBtn").disabled = !ok;
    hint(ok ? "" : "on.off");
    const room = new URLSearchParams(location.search).get("room");
    if (ok && room) openLobby(room.toUpperCase().slice(0, 5));
  });

  // Cambio lingua: ridisegna i testi costruiti dal codice.
  window.addEventListener("omg-lang-changed", () => {
    hint(hintKey);
    renderAuth();
    renderSettings();
    if ($("final").classList.contains("active")) renderDuelSummary();
  });
})();
