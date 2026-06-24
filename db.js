// ── APEX DB v21 — Firebase Firestore + Auth Google ────────────
// Architecture :
//   - Firebase Firestore = base de données cloud (remplace IndexedDB)
//   - Auth Google = connexion sécurisée (toi seul accèdes à tes données)
//   - Chaque donnée est isolée par uid : /users/{uid}/{store}/{id}
//   - IndexedDB local garde un cache offline (si réseau coupé, ça marche)
//
// ⚠️  CONFIGURATION : remplace les valeurs FIREBASE_CONFIG ci-dessous
//     par celles de ta console Firebase (voir guide de setup).

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCWQ9UkkJPL0qA_K_dnM6RaoDIfexTY5FI",
  authDomain:        "apex-dashboard-d360d.firebaseapp.com",
  projectId:         "apex-dashboard-d360d",
  storageBucket:     "apex-dashboard-d360d.firebasestorage.app",
  messagingSenderId: "870945926021",
  appId:             "1:870945926021:web:08861aa9e55de6433bb2ec"
};

// ── Chargement Firebase SDK (CDN) ─────────────────────────────
// On injecte les scripts dynamiquement pour garder index.html propre
let _firebaseReady = false;
let _firebaseReadyResolve;
const _firebaseReadyPromise = new Promise(r => { _firebaseReadyResolve = r; });

(function loadFirebase() {
  const scripts = [
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js',
  ];
  let loaded = 0;
  scripts.forEach(src => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { if (++loaded === scripts.length) { _initFirebase(); } };
    document.head.appendChild(s);
  });
})();

function _initFirebase() {
  firebase.initializeApp(FIREBASE_CONFIG);
  _firebaseReady = true;
  _firebaseReadyResolve();
}

async function _waitFirebase() {
  if (_firebaseReady) return;
  await _firebaseReadyPromise;
}

// ── Auth ──────────────────────────────────────────────────────
const Auth = (() => {
  let _user = null;
  let _onUserChange = null;

  async function init(onUserChange) {
    await _waitFirebase();
    _onUserChange = onUserChange;
    return new Promise(resolve => {
      firebase.auth().onAuthStateChanged(user => {
        _user = user;
        if (_onUserChange) _onUserChange(user);
        resolve(user);
      });
    });
  }

  async function signInWithGoogle() {
    await _waitFirebase();
    const provider = new firebase.auth.GoogleAuthProvider();
    // Force account picker every time for security
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await firebase.auth().signInWithPopup(provider);
    } catch(e) {
      // Popup blocked on mobile — fallback to redirect
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
        await firebase.auth().signInWithRedirect(provider);
      } else {
        throw e;
      }
    }
  }

  async function signOut() {
    await firebase.auth().signOut();
  }

  function getUser() { return _user; }
  function getUid()  { return _user ? _user.uid : null; }
  function isReady() { return !!_user; }

  return { init, signInWithGoogle, signOut, getUser, getUid, isReady };
})();

// ── DB ────────────────────────────────────────────────────────
const DB = (() => {
  const STORES = [
    'workout_program', 'medocs', 'orders', 'catalogue', 'clients',
    'protocoles', 'finances', 'todos', 'mood', 'settings',
    'weight', 'weekly_recap', 'tiktok_stats', 'categories', 'tags',
  ];

  function _col(store) {
    const uid = Auth.getUid();
    if (!uid) throw new Error('Non authentifié');
    return firebase.firestore().collection('users').doc(uid).collection(store);
  }

  async function getAll(store) {
    await _waitFirebase();
    const snap = await _col(store).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function get(store, id) {
    await _waitFirebase();
    const doc = await _col(store).doc(id).get();
    if (!doc.exists) return undefined;
    return { id: doc.id, ...doc.data() };
  }

  async function put(store, item) {
    await _waitFirebase();
    if (!item.id) item.id = crypto.randomUUID();
    const { id, ...data } = item;
    await _col(store).doc(id).set(data, { merge: true });
    return item;
  }

  async function del(store, id) {
    await _waitFirebase();
    await _col(store).doc(id).delete();
  }

  async function getSetting(key) {
    const item = await get('settings', key);
    return item ? item.value : null;
  }

  async function setSetting(key, value) {
    return put('settings', { id: key, value });
  }

  async function exportAll() {
    const result = {};
    for (const store of STORES) {
      result[store] = await getAll(store);
    }
    return result;
  }

  async function importAll(data) {
    for (const store of STORES) {
      if (data[store]) {
        for (const item of data[store]) {
          await put(store, item);
        }
      }
    }
  }

  return { getAll, get, put, del, getSetting, setSetting, exportAll, importAll, STORES };
})();
