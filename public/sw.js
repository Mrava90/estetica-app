// Service worker minimo, solo para que la app sea instalable como PWA.
//
// A proposito NO interceptamos las requests. La version anterior hacia
// `event.respondWith(fetch(event.request))`, que parece inofensivo pero
// rompia la navegacion: las requests de navegacion usan redirect:'manual',
// asi que al re-pedir /calendario (que redirige a /login sin sesion) la
// promesa se rechazaba y el navegador devolvia un error de red. De paso
// eso tambien hacia fallar la carga del manifest, que Chrome reportaba
// como "Manifest: Line 1, column 1, Syntax error".
//
// Un handler de fetch vacio alcanza para el criterio de instalabilidad y
// deja que el navegador maneje cada request normalmente. Si algun dia
// queremos soporte offline, hay que hacerlo con cache explicito y un
// catch por request, nunca con un passthrough pelado.

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Limpiar cualquier cache que haya dejado una version anterior.
    const nombres = await caches.keys()
    await Promise.all(nombres.map((n) => caches.delete(n)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', () => {
  // Sin respondWith: el navegador resuelve la request como corresponde.
})
