/*
 * Offline support for the notes site.
 *
 * Three caches:
 *   notes-shell-<build>   the page, script and styles of this build, fetched on install
 *   notes-runtime-<build> anything opened while browsing (notes, pictures, mermaid) - so a note read once opens offline
 *   notes-offline         the whole site, filled only when the reader presses "Save for offline" (site.js)
 *
 * Notes and the index are network-first: online readers always get the latest build, and the cache answers only
 * when the network cannot. Versioned assets (site.js?v=…) and pictures never change at a URL, so they are
 * cache-first. The two build caches are dropped when a new build installs; the saved copy is kept until the reader
 * updates or removes it.
 */
const BUILD = '20261114133823';
const SHELL = `notes-shell-${BUILD}`;
const RUNTIME = `notes-runtime-${BUILD}`;
const OFFLINE = 'notes-offline';

const SHELL_FILES = [
  './',
  'index.html',
  `site.js?v=${BUILD}`,
  `site.css?v=${BUILD}`,
  `markdown.css?v=${BUILD}`,
  `vendor/highlight-light.css?v=${BUILD}`,
  `vendor/highlight-dark.css?v=${BUILD}`,
  'vendor/inter.woff2',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'data/index.json'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // One at a time and failures ignored: a single missing file must not stop the worker installing.
    await Promise.all(SHELL_FILES.map(async path => {
      try {
        const response = await fetch(path, { cache: 'no-cache' });
        if (cacheable(response)) await cache.put(path, response);
      } catch {
        // offline or gated: the page still works online without this entry
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, RUNTIME, OFFLINE]);
    for (const name of await caches.keys()) {
      if (name.startsWith('notes-') && !keep.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Always fresh: the worker itself and the list of files to save.
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/data/offline.json')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, 'index.html'));
  } else if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

/** Only plain same-origin successes are stored; a redirect to a login page must never be cached as a note. */
function cacheable(response) {
  return response && response.ok && response.type === 'basic' && !response.redirected;
}

async function fromCache(request, fallback) {
  return (await caches.match(request))
    ?? (await caches.match(request, { ignoreSearch: true }))
    ?? (fallback ? await caches.match(fallback, { ignoreSearch: true }) : undefined);
}

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      const copy = response.clone();
      caches.open(RUNTIME).then(cache => cache.put(request, copy));
    }
    return response;
  } catch (error) {
    const cached = await fromCache(request, fallback);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      const copy = response.clone();
      caches.open(RUNTIME).then(cache => cache.put(request, copy));
    }
    return response;
  } catch (error) {
    // Offline: an older build's copy of the same file is better than nothing.
    const older = await caches.match(request, { ignoreSearch: true });
    if (older) return older;
    throw error;
  }
}
