// ── Firebase Messaging Service Worker ────────────────────────
// Requis par Firebase Cloud Messaging pour recevoir les notifs
// en arrière-plan (app fermée)

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCWQ9UkkJPL0qA_K_dnM6RaoDIfexTY5FI",
  authDomain: "apex-dashboard-d360d.firebaseapp.com",
  projectId: "apex-dashboard-d360d",
  storageBucket: "apex-dashboard-d360d.firebasestorage.app",
  messagingSenderId: "870945926021",
  appId: "1:870945926021:web:08861aa9e55de6433bb2ec"
});

const messaging = firebase.messaging();

// Reçoit les notifs quand l'app est en arrière-plan ou fermée
messaging.onBackgroundMessage(payload => {
  const { title, body, tag } = payload.notification || payload.data || {};
  self.registration.showNotification(title || 'APEX', {
    body: body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: tag || 'apex',
    renotify: true,
    vibrate: [200, 100, 200],
  });
});
