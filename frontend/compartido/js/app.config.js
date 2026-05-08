(function initSoftSysAppConfig(window) {
  "use strict";

  const DEFAULT_ASSET_VERSION = "2026.04.18.03";
  const DEFAULT_IDLE_TIMEOUT_MS = 90 * 60 * 1000;
  const DEFAULT_IDLE_CHECK_MS = 30 * 1000;

  let idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS;
  let idleCheckMs = DEFAULT_IDLE_CHECK_MS;

  try {
    const rawTimeout = Number(localStorage.getItem("softsys_idle_timeout_ms"));
    if (Number.isFinite(rawTimeout) && rawTimeout > 0) {
      idleTimeoutMs = rawTimeout;
    }
  } catch {
    // noop
  }

  try {
    const rawCheck = Number(localStorage.getItem("softsys_idle_check_ms"));
    if (Number.isFinite(rawCheck) && rawCheck >= 10000) {
      idleCheckMs = rawCheck;
    }
  } catch {
    // noop
  }

  window.SoftSysAppConfig = Object.freeze({
    assetVersion: DEFAULT_ASSET_VERSION,
    idleTimeoutMs,
    idleCheckMs
  });
})(window);
