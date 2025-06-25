// Service Worker with proper PDF handling
const CACHE_NAME = 'ocr-app-v1';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip service worker for PDF-related requests to avoid cloning issues
  if (url.pathname.includes('/api/documents/') && 
      (url.pathname.includes('/raw') || url.pathname.includes('/pdf'))) {
    console.log('🔄 Bypassing service worker for PDF request:', url.pathname);
    return; // Let the request go through normally
  }
  
  // Skip service worker for PDF.js worker files
  if (url.pathname.includes('pdf.worker') || url.pathname.includes('pdfjs-dist')) {
    console.log('🔄 Bypassing service worker for PDF.js worker:', url.pathname);
    return;
  }
  
  // Handle other requests with proper response cloning
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Clone the request before fetching (not the response)
      const fetchRequest = event.request.clone();
      
      return fetch(fetchRequest).then((response) => {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        // Clone the response ONCE before caching
        const responseToCache = response.clone();
        
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        // Return the original response (not cloned)
        return response;
      }).catch((error) => {
        console.error('Fetch failed:', error);
        throw error;
      });
    })
  );
});

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(self.clients.claim());
});