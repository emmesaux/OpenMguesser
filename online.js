// Parte online (classifica globale e sfide 1 contro 1) su Firebase, piano gratuito.
// Si gioca subito come ospite (accesso anonimo automatico): i dati dell'ospite scadono dopo 14 giorni.
// Chi vuole può accedere con Google per conservare profilo e punteggi.
// Si attiva solo se in config.js c'è la configurazione Firebase; il profilo funziona comunque offline.
const CFG = (window.OMG_CONFIG || {}).firebase || null;
const FB = "https://www.gstatic.com/firebasejs/10.14.1/";
const ICONS = ["🦊", "🐼", "🦉", "🐙", "🦁", "🐯", "🐧", "🦄", "🐢", "🦋", "🐬", "🦅", "🐨", "🦒", "🐸", "🦔", "🐳", "🦜", "🌵", "🍀", "🚀", "🧭", "⛵", "🏔️"];
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // senza 0/O/1/I per evitare confusione
const PROFILE_KEY = "omg-profile";
const GUEST_DAYS = 14; // vita dei dati di un ospite
const ROOM_DAYS = 1;   // vita di stanze e risposte delle sfide

const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const rndCode = (len) => Array.from({ length: len }, () => CODE_CHARS[rnd(CODE_CHARS.length)]).join("");
const newProfile = () => ({ name: "Guest-" + rndCode(6), icon: ICONS[rnd(ICONS.length)] });
const saveLocal = (p) => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* storage non disponibile */ } };

function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    if (p && typeof p.name === "string" && typeof p.icon === "string") return p;
  } catch (e) { /* profilo non valido: se ne crea uno nuovo */ }
  const p = newProfile();
  saveLocal(p);
  return p;
}

const O = (window.OMG_ONLINE = {
  ready: false, enabled: false, uid: null, anonymous: true, profile: loadProfile(),
  icons: ICONS,
  // Profilo personalizzato: nome 3-20 caratteri (lettere, numeri, spazio, _ e -) e icona dalla lista.
  setProfile({ name, icon }) {
    const n = String(name || "").trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9_ -]{3,20}$/.test(n)) throw new Error("Il nome deve avere 3-20 caratteri: lettere, numeri, spazio, _ o -.");
    if (!ICONS.includes(icon)) throw new Error("Scegli un'icona dalla lista.");
    O.profile = { name: n, icon };
    saveLocal(O.profile);
    if (O.enabled) O._syncProfile().catch(() => {});
    return O.profile;
  },
  rerollProfile() {
    O.profile = newProfile();
    saveLocal(O.profile);
    if (O.enabled) O._syncProfile().catch(() => {});
    return O.profile;
  },
});

async function init() {
  if (!CFG || !CFG.apiKey || !CFG.projectId) return;
  const [appM, authM, fs] = await Promise.all([
    import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js"),
  ]);
  const app = appM.initializeApp(CFG);
  const auth = authM.getAuth(app);
  const db = fs.getFirestore(app);
  const ts = (days) => fs.Timestamp.fromMillis(Date.now() + days * 86400000);
  const notify = () => window.dispatchEvent(new Event("omg-auth-changed"));

  // Il campo expiresAt serve alla policy TTL di Firestore (cancellazione automatica) e alle regole.
  // Per gli account Google è null: i dati restano.
  O._syncProfile = () => fs.setDoc(fs.doc(db, "players", O.uid), {
    name: O.profile.name, icon: O.profile.icon, updatedAt: fs.serverTimestamp(),
    expiresAt: O.anonymous ? ts(GUEST_DAYS) : null,
  });

  async function useCurrentUser() {
    const u = auth.currentUser;
    O.uid = u.uid;
    O.anonymous = u.isAnonymous;
    if (!O.anonymous) {
      // Account Google: ripristina il profilo salvato (nome e icona scelti, non quelli di Google).
      try {
        // Con un tempo massimo: se Firestore non risponde non si blocca l'avvio.
        const s = await Promise.race([
          fs.getDoc(fs.doc(db, "players", O.uid)),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
        ]);
        if (s.exists() && s.data().name && s.data().icon) {
          O.profile = { name: s.data().name, icon: s.data().icon };
          saveLocal(O.profile);
        }
      } catch (e) { /* si usa il profilo locale */ }
    }
    // Non si aspetta la scrittura: il setDoc di Firestore può restare in attesa se il database non risponde.
    O._syncProfile().catch(() => {});
    notify();
  }

  // Accesso automatico come ospite, ripristinando una sessione precedente se esiste.
  await auth.authStateReady();
  if (!auth.currentUser) await authM.signInAnonymously(auth);
  O.enabled = true;
  await useCurrentUser();

  O.signInGoogle = async () => {
    const provider = new authM.GoogleAuthProvider();
    try {
      // Collega Google all'ospite: stesso utente, ma da ora i dati non scadono.
      await authM.linkWithPopup(auth.currentUser, provider);
    } catch (e) {
      if (e.code === "auth/credential-already-in-use") {
        const cred = authM.GoogleAuthProvider.credentialFromError(e);
        if (!cred) throw e;
        await authM.signInWithCredential(auth, cred); // account Google già esistente: ci si entra
      } else {
        throw e;
      }
    }
    await useCurrentUser();
  };

  O.signOut = async () => {
    await authM.signOut(auth);
    await authM.signInAnonymously(auth);
    O.profile = newProfile(); // nuovo ospite, nuova identità
    saveLocal(O.profile);
    await useCurrentUser();
  };

  O.submitScore = (total, provider) => fs.addDoc(fs.collection(db, "scores"), {
    uid: O.uid, name: O.profile.name, icon: O.profile.icon, total: Math.round(total),
    provider: String(provider || ""), createdAt: fs.serverTimestamp(),
    expiresAt: O.anonymous ? ts(GUEST_DAYS) : null,
  });

  // Miglior punteggio per giocatore, primi 50. I punteggi scaduti non si mostrano
  // anche se la cancellazione automatica non è ancora passata.
  O.topScores = async () => {
    const snap = await fs.getDocs(fs.query(fs.collection(db, "scores"), fs.orderBy("total", "desc"), fs.limit(200)));
    const now = Date.now(), seen = new Set(), out = [];
    snap.forEach((d) => {
      const s = d.data();
      if (s.expiresAt && s.expiresAt.toMillis() <= now) return;
      if (seen.has(s.uid)) return;
      seen.add(s.uid);
      out.push({ uid: s.uid, name: s.name, icon: s.icon, total: s.total, provider: s.provider, guest: !!s.expiresAt });
    });
    return out.slice(0, 50);
  };

  O.createRoom = async ({ provider, rule, time, spots }) => {
    const clean = JSON.parse(JSON.stringify(spots)); // niente `undefined`, che Firestore rifiuta
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = rndCode(5), ref = fs.doc(db, "rooms", code);
      try {
        await fs.runTransaction(db, async (tx) => {
          if ((await tx.get(ref)).exists()) throw new Error("taken");
          tx.set(ref, {
            host: O.uid, hostName: O.profile.name, hostIcon: O.profile.icon,
            guest: null, guestName: null, guestIcon: null,
            provider, rule, time, spots: clean, status: "waiting",
            createdAt: fs.serverTimestamp(), expiresAt: ts(ROOM_DAYS),
          });
        });
        return code;
      } catch (e) {
        if (e.message !== "taken") throw e;
      }
    }
    throw new Error("Non riesco a creare la stanza, riprova.");
  };

  O.joinRoom = async (rawCode) => {
    const code = String(rawCode || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) throw new Error("Il codice ha 5 caratteri.");
    const ref = fs.doc(db, "rooms", code);
    const room = await fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Stanza non trovata.");
      const d = snap.data();
      if (d.host === O.uid) throw new Error("Questa stanza l'hai creata tu: condividi il codice con un amico.");
      if (d.guest && d.guest !== O.uid) throw new Error("La stanza è già piena.");
      if (d.guest === O.uid) return d;
      const patch = { guest: O.uid, guestName: O.profile.name, guestIcon: O.profile.icon, status: "playing" };
      tx.update(ref, patch);
      return { ...d, ...patch };
    });
    return { code, room };
  };

  O.watchRoom = (code, cb) => fs.onSnapshot(fs.doc(db, "rooms", code), (s) => s.exists() && cb(s.data()));
  O.submitGuess = (code, round, g) => fs.setDoc(fs.doc(db, "rooms", code, "guesses", `${O.uid}_${round}`), {
    uid: O.uid, round, lat: g.lat ?? null, lng: g.lng ?? null, km: g.km ?? null, pts: g.pts,
    at: fs.serverTimestamp(), expiresAt: ts(ROOM_DAYS),
  });
  O.watchGuesses = (code, cb) => fs.onSnapshot(fs.collection(db, "rooms", code, "guesses"), (snap) => cb(snap.docs.map((d) => d.data())));
}

init()
  .catch((e) => { console.warn("Online non disponibile:", e && e.message); })
  .finally(() => { O.ready = true; window.dispatchEvent(new Event("omg-online-ready")); });
