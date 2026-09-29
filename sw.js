// Firebase Cloud Messaging support
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAxqkJiZL94gR3W5TBPTRNE5AdLyCDwb2g",
    authDomain: "wellness-tracker-127.firebaseapp.com",
    projectId: "wellness-tracker-127",
    storageBucket: "wellness-tracker-127.firebasestorage.app",
    messagingSenderId: "769681534889",
    appId: "1:769681534889:web:a273b28653892af4039eb8"
});

const messaging = firebase.messaging();

// Handle background push notifications (when app is not in foreground)
messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'Wellness Reminder';
    const options = {
        body: payload.notification?.body || '',
        icon: './icon.png',
        badge: './icon.png',
        vibrate: [200, 100, 200],
        requireInteraction: true
    };
    return self.registration.showNotification(title, options);
});

const CACHE_NAME = 'wellness-tracker-v13';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // Skip non-GET and cross-origin requests (Firebase, CDN, etc.)
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow('./');
        })
    );
});
