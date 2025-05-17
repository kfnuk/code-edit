// service-worker.js

const CACHE_NAME = 'code-editor-pwa-cache-v1';
// List of files that make up the application shell.
// Note: Vite will hash your JS and CSS filenames in production builds.
// This basic service worker is more suited for development or if you manually manage filenames.
// For production with Vite, you'd typically use a Vite PWA plugin that handles asset hashing.
const urlsToCache = [
  '/', // Your index.html
  '/index.html',
  '/style.css',
  // '/app.js', // Vite will hash this, so direct caching is tricky without a plugin
  '/manifest.json',
  // Add paths to your icons if they are not in the public folder and need explicit caching
  // e.g., '/icons/icon-192x192.png', '/icons/icon-512x512.png'
  // If icons are in the public folder, they are usually handled well by the browser cache
  // once the manifest is read.
];

// Install event: Cache the application shell.
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        // Add all URLs to cache. If any request fails, the service worker installation will fail.
        return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => {
        console.log('Service Worker: App shell cached successfully');
        return self.skipWaiting(); // Activate the new service worker immediately
      })
      .catch((error) => {
        console.error('Service Worker: Failed to cache app shell:', error);
      })
  );
});

// Activate event: Clean up old caches.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('Service Worker: Now ready to handle fetches!');
        return self.clients.claim(); // Take control of all open clients immediately
    })
  );
});

// Fetch event: Serve cached content when offline.
self.addEventListener('fetch', (event) => {
  // We only want to handle GET requests for navigation or specified assets
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          // Serve from cache
          // console.log('Service Worker: Serving from cache:', event.request.url);
          return response;
        }
        // Not in cache, fetch from network
        // console.log('Service Worker: Fetching from network:', event.request.url);
        return fetch(event.request).then(
          (networkResponse) => {
            // Optionally, cache the newly fetched resource if it's part of your app shell
            // or if you have a dynamic caching strategy.
            // For this basic example, we are not dynamically caching new network requests.
            return networkResponse;
          }
        ).catch(error => {
            console.error("Service Worker: Fetch failed; returning offline page if available, or error.", error);
            // You could return a custom offline fallback page here if one was cached.
            // For example: return caches.match('/offline.html');
        });
      })
  );
});
