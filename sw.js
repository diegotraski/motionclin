/* MotionClin · service worker: la app y el modelo de visión quedan guardados para usarla sin conexión. */
const VERSION = 'motionclin-v3.2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/metrics.js', 'js/storage.js', 'js/charts.js', 'js/pose.js', 'js/report.js', 'js/replay.js', 'js/player.js', 'js/phases.js', 'js/synth.js', 'js/demo.js', 'js/app.js',
  'vendor/jspdf/jspdf.umd.min.js', 'vendor/mediapipe-pose/pose.js', 'icons/icon-192.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Modelo, librerías y vídeo de ejemplo: primero la caché (son grandes y no cambian)
  if (/\/(vendor|samples|icons)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })));
    return;
  }
  // Código de la app: primero la red (para recibir actualizaciones) y la caché si no hay conexión
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
});
