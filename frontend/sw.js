/* eslint-disable no-restricted-globals */
"use strict";

const swUrl = new URL(self.location.href);
const VERSION = swUrl.searchParams.get("v") || "dev";

const STATIC_CACHE = `softsys-static-${VERSION}`;
const IMAGE_CACHE = `softsys-images-${VERSION}`;
const CACHE_PREFIX = "softsys-";
const UPLOADS_PREFIX = "/uploads/";

const CORE_ASSETS = [
  "/compartido/css/base.css",
  "/compartido/css/home.css",
  "/compartido/css/style.css",
  "/compartido/js/app.config.js",
  "/compartido/js/cache.bootstrap.js",
  "/compartido/js/home.js",
  "/compartido/js/seguridad.js",
  "/compartido/js/session.manager.js",
  "/login/login.css",
  "/login/login.js",
  "/modulos/productos/productos.css",
  "/modulos/productos/productos.js",
  "/modulos/venta/css/venta.css",
  "/modulos/venta/css/venta.modales.css",
  "/modulos/venta/css/venta_medio.css",
  "/modulos/venta/venta_rapida.js",
  "/modulos/venta/venta_medio.js",
  "/recursos/css/all.min.css",
  "/recursos/img/logo_softsys.png",
  "/recursos/img/icono.png",
  "/recursos/webfonts/fa-solid-900.woff2",
  "/recursos/webfonts/fa-regular-400.woff2",
  "/recursos/webfonts/fa-brands-400.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await Promise.allSettled(
        CORE_ASSETS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            // noop
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== IMAGE_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function shouldBypassRequest(request, url) {
  const accept = String(request.headers.get("accept") || "").toLowerCase();

  if (request.method !== "GET") return true;
  if (!isSameOrigin(url)) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  if (url.pathname.endsWith(".html")) return true;
  if (url.pathname === "/manifest.json" || url.pathname === "/sw.js") return true;
  if (accept.includes("text/html")) return true;

  return false;
}

function isCacheableResponse(response) {
  if (!response || !response.ok) return false;
  const cacheControl = String(response.headers.get("Cache-Control") || "").toLowerCase();
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) return false;
  return true;
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response?.status === 304 && cached) {
        return cached;
      }
      if (isCacheableResponse(response)) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const network = await networkPromise;
  if (network) return network;

  return Response.error();
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response?.status === 304) {
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
    }
    if (isCacheableResponse(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (shouldBypassRequest(request, url)) return;

  const destination = request.destination;
  const isUpload = url.pathname.startsWith(UPLOADS_PREFIX);
  const isImage = destination === "image";
  const isStatic = destination === "style" || destination === "script" || destination === "font";

  if (isUpload && isImage) {
    event.respondWith(networkFirst(IMAGE_CACHE, request));
    return;
  }

  if (isImage) {
    event.respondWith(staleWhileRevalidate(IMAGE_CACHE, request));
    return;
  }

  if (isStatic) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
  }
});
