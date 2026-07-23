// Service worker EliteTime — cache des assets statiques UNIQUEMENT.
// Ne met jamais en cache ni n'intercepte /api/* ou /socket.io/* (données authentifiées/dynamiques).

const CACHE_VERSION = "v1";
const CACHE_NAME = `elitetime-static-${CACHE_VERSION}`;

const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/", "/logo/"];

function isStaticAssetRequest(url, request) {
  if (url.origin !== self.location.origin) return false;
  if (STATIC_PATH_PREFIXES.some((p) => url.pathname.startsWith(p))) return true;
  if (request.destination === "font") return true;
  return false;
}

function isExcludedPath(pathname) {
  return pathname.startsWith("/api/") || pathname.startsWith("/socket.io/");
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("elitetime-static-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Ne jamais toucher au trafic API/temps réel : laisser le navigateur
  // gérer nativement, comme si aucun service worker n'existait.
  if (isExcludedPath(url.pathname)) return;

  if (!isStaticAssetRequest(url, request)) return;

  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);

        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === "basic") {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => undefined);

        if (cached) {
          // stale-while-revalidate : on sert le cache immédiatement,
          // on rafraîchit en arrière-plan (rejet déjà intercepté ci-dessus).
          void networkFetch;
          return cached;
        }

        const fresh = await networkFetch;
        if (fresh) return fresh;

        return fetch(request);
      } catch {
        return fetch(request);
      }
    })()
  );
});
