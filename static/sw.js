self.addEventListener('install', function(event) {
    console.log('[SW] 설치 완료');
  });
  
  self.addEventListener('fetch', function(event) {
    event.respondWith(fetch(event.request));
  });