self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const handleFetch = async request => {
  const r = await fetch(request.mode === 'no-cors' ? new Request(request, { credentials: 'omit' }) : request).catch(e => console.error(e));

  if (r.status === 0) {
    return r;
  }

  const headers = new Headers(r.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  // headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

  return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
};

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  e.respondWith(handleFetch(request));
});