const CACHE_NAME = 'datavez-v7';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

const SHARE_DB_NAME = 'datavez-db';
const SHARE_DB_VERSION = 2;

function openShareDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', {keyPath:'id'});
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', {keyPath:'key'});
      if(!db.objectStoreNames.contains('shareQueue')) db.createObjectStore('shareQueue', {keyPath:'id'});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function handleShareTarget(event){
  try{
    const formData = await event.request.formData();
    const file = formData.get('sharedFile');
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    if(file && file.size > 0){
      const buffer = await file.arrayBuffer();
      const db = await openShareDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('shareQueue', 'readwrite');
        tx.objectStore('shareQueue').put({
          id: 'pending',
          name: file.name || 'shared-file',
          type: file.type || 'application/octet-stream',
          data: buffer,
          title, text,
          ts: Date.now()
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
  }catch(e){
    // ignore — still redirect back into the app
  }
  return Response.redirect('./?shared=1', 303);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if(event.request.method === 'POST'){
    event.respondWith(handleShareTarget(event));
    return;
  }

  const isHTML = event.request.mode === 'navigate' || event.request.url.endsWith('.html') || event.request.url.endsWith('/');

  if(isHTML){
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  }else{
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
