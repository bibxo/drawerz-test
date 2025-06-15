// sw.js
const CACHE_NAME = 'drawerz-cache-v1'; // For potential caching, though not strictly used for headers
const COOP_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp' // or 'credentialless'
};

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Ensures the new SW activates faster
  console.log('Drawerz Service Worker: Installing...');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // Makes the SW take control of current pages immediately
  console.log('Drawerz Service Worker: Activated.');
  // Notify clients that SW has activated.
  self.clients.matchAll({ type: 'window' }).then(windowClients => {
    windowClients.forEach(windowClient => {
      windowClient.postMessage({ type: 'SW_ACTIVATED' });
    });
  });
});

self.addEventListener('fetch', (event) => {
  // We only want to modify navigation requests for HTML pages,
  // particularly the main document (index.html).
  if (event.request.mode === 'navigate' && 
      event.request.destination === 'document' &&
      (event.request.url.endsWith('/') || event.request.url.endsWith('.html'))) {
    
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          
          // Check if we can actually modify the response.
          // Opaque responses (e.g., from no-cors requests, or redirects to other origins) cannot be modified.
          if (networkResponse.type === 'opaque') {
            return networkResponse;
          }

          // Create new headers based on the original response's headers
          const newHeaders = new Headers(networkResponse.headers);
          for (const key in COOP_HEADERS) {
            newHeaders.set(key, COOP_HEADERS[key]);
          }
          
          // console.log('SW: Serving with COOP/COEP headers for:', event.request.url);
          return new Response(networkResponse.body, {
            status: networkResponse.status,
            statusText: networkResponse.statusText,
            headers: newHeaders,
          });
        } catch (error) {
          console.error('Drawerz Service Worker: Fetch error for navigation request:', error, event.request.url);
          // Fallback to network to avoid breaking site if SW has issues during fetch.
          // This could happen if the network is down *and* nothing is cached.
          return fetch(event.request); 
        }
      })()
    );
  } else {
    // For all other requests (JS, CSS, images, API calls, etc.),
    // let them pass through normally. The document loading them needs the headers.
    event.respondWith(fetch(event.request));
  }
});