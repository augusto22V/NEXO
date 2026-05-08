(function registerSoftSysSW(window) {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  const config = window.SoftSysAppConfig || {};
  const version = String(config.assetVersion || "dev");
  const swUrl = `/sw.js?v=${encodeURIComponent(version)}`;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(swUrl, { scope: "/" });

      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      registration?.addEventListener?.("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            installing.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    } catch (error) {
      console.warn("No se pudo registrar Service Worker:", error?.message || error);
    }
  });
})(window);
