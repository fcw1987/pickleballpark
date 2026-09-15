const CACHE_PREFIX = 'pickleboard-';
const STATIC_CACHE = `${CACHE_PREFIX}static-v23`;
const LEGACY_CACHES = new Set(['pickleboard-cache-v1']);
const APP_SHELL_URL = new URL('./index.html', self.location).href;
const STATIC_ASSETS = [
  './',
  './index.html',
  './script.js',
  './play-builder.js',
  './play-document.js',
  './play-compiler.js',
  './builder-storage.js',
  './builder-ui.js',
  './builder-ui.css',
  './builder-integration.css',
  './builder-court-tools.js',
  './builder-framing.js',
  './builder-waypoint-policy.js',
  './coverage-assistance.js',
  './rally-rules.js',
  './visual-theme.js',
  './board-projection.js',
  './three-d-loader.js',
  './guided-plays.js',
  './guided-pixel-actors.js',
  './pixel-actor-assets.js',
  './play-catalog.js',
  './court-geometry.js',
  './coaching-session.js',
  './shot-chapters.js',
  './shot-timeline.js',
  './shot-timeline.css',
  './coaching-ui.js',
  './park-layout.js',
  './park-scene.js',
  './assets/park/quiet-court.png',
  './assets/park/grass.png',
  './assets/park/path.png',
  './assets/park/tree.png',
  './assets/park/shrub.png',
  './assets/park/bench.png',
  './assets/park/banner.png',
  './assets/park/menu-frame-light.png',
  './assets/park/menu-frame-dark.png',
  './assets/park/menu-labels.ttf',

  './three-d-core.js',
  './three-d-animation.js',
  './three-d-playback.js',
  './three-d-presentation.js',
  './three-d-pixel-actors.js',
  './three-d-ball.js',
  './assets/replay/metadata.json',
  './assets/replay/green-left-back-body.png',
  './assets/replay/green-left-back-left-body.png',
  './assets/replay/green-left-back-right-action.png',
  './assets/replay/green-left-back-right-body.png',
  './assets/replay/green-left-front-action.png',
  './assets/replay/green-left-front-body.png',
  './assets/replay/green-left-front-right-body.png',
  './assets/replay/green-left-left-body.png',
  './assets/replay/green-right-back-body.png',
  './assets/replay/green-right-back-left-body.png',
  './assets/replay/green-right-back-right-action.png',
  './assets/replay/green-right-back-right-body.png',
  './assets/replay/green-right-front-action.png',
  './assets/replay/green-right-front-body.png',
  './assets/replay/green-right-front-right-body.png',
  './assets/replay/green-right-left-body.png',
  './assets/replay/orange-left-back-body.png',
  './assets/replay/orange-left-back-left-body.png',
  './assets/replay/orange-left-back-right-action.png',
  './assets/replay/orange-left-back-right-body.png',
  './assets/replay/orange-left-front-action.png',
  './assets/replay/orange-left-front-body.png',
  './assets/replay/orange-left-front-right-body.png',
  './assets/replay/orange-left-left-body.png',
  './assets/replay/orange-right-back-body.png',
  './assets/replay/orange-right-back-left-body.png',
  './assets/replay/orange-right-back-right-action.png',
  './assets/replay/orange-right-back-right-body.png',
  './assets/replay/orange-right-front-action.png',
  './assets/replay/orange-right-front-body.png',
  './assets/replay/orange-right-front-right-body.png',
  './assets/replay/orange-right-left-body.png',
  './vendor/three.module.min.js',
  './vendor/three.core.min.js',
  './styles.css',
  './manifest.json',
  './assets/players/green-left-handed.png',
  './assets/players/green-right-handed.png',
  './assets/players/orange-left-handed.png',
  './assets/players/orange-right-handed.png',
  './icons/apple-icon-180.png',
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png'
];
const CACHEABLE_URLS = new Set(STATIC_ASSETS.map(path => new URL(path, self.location).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    const obsoletePickleboardCaches = cacheNames.filter(cacheName =>
      cacheName !== STATIC_CACHE &&
      (cacheName.startsWith(CACHE_PREFIX) || LEGACY_CACHES.has(cacheName))
    );
    await Promise.all(obsoletePickleboardCaches.map(cacheName => caches.delete(cacheName)));
    await self.clients.claim();
  })());
});

async function updateStaticCache(request, response) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response);
  } catch (error) {
    console.warn('Unable to refresh the Pickleball Park static cache:', error);
  }
}

async function matchStaticCache(request) {
  const cache = await caches.open(STATIC_CACHE);
  return cache.match(request);
}

async function fetchAndRefresh(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await updateStaticCache(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await matchStaticCache(request);
    if (cached) return cached;
    throw error;
  }
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    const requestUrl = new URL(request.url);
    const shellUrl = new URL(APP_SHELL_URL);
    const scopePath = new URL(self.registration.scope).pathname;
    const isAppShell = requestUrl.pathname === shellUrl.pathname || requestUrl.pathname === scopePath;

    if (isAppShell && response.ok && response.type === 'basic') {
      await updateStaticCache(APP_SHELL_URL, response.clone());
    }
    return response;
  } catch (error) {
    const cachedShell = await matchStaticCache(APP_SHELL_URL);
    if (!cachedShell) throw error;

    const requestPath = new URL(request.url).pathname;
    const shellPath = new URL(APP_SHELL_URL).pathname;
    const scopePath = new URL(self.registration.scope).pathname;
    if (requestPath !== shellPath && requestPath !== scopePath) {
      return Response.redirect(APP_SHELL_URL, 302);
    }
    return cachedShell;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  const normalizedUrl = new URL(requestUrl.pathname, self.location.origin).href;
  if (!CACHEABLE_URLS.has(normalizedUrl)) return;

  const normalizedRequest = new Request(normalizedUrl, { credentials: 'same-origin' });
  event.respondWith(fetchAndRefresh(normalizedRequest));
});
