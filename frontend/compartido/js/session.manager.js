(function initSoftSysSession(window) {
  "use strict";

  const LOGIN_URL = "/login/login.html";
  const LAST_ACTIVITY_KEY = "softsys_last_activity_ts";
  const LAST_VISIBLE_USER_KEY = "softsys_usuario_visible";

  const SAFE_LOCAL_KEYS = new Set([
    "empresaId",
    "terminalId",
    LAST_VISIBLE_USER_KEY
  ]);

  let idleIntervalId = null;
  let activityBound = false;
  let logoutInProgress = false;

  function safeLocalGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeLocalSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // noop
    }
  }

  function safeLocalRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // noop
    }
  }

  function touchActivity() {
    safeLocalSet(LAST_ACTIVITY_KEY, String(Date.now()));
  }

  function getLastActivityTs() {
    const raw = Number(safeLocalGet(LAST_ACTIVITY_KEY) || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }

  function preserveKeyOnLogout(key) {
    return SAFE_LOCAL_KEYS.has(String(key || ""));
  }

  function purgeClientSession(options = {}) {
    const preserveSafe = options.preserveSafe !== false;
    const localKeysToRemove = [];

    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;

        if (preserveSafe && preserveKeyOnLogout(key)) {
          continue;
        }

        localKeysToRemove.push(key);
      }
    } catch {
      // noop
    }

    localKeysToRemove.forEach((key) => safeLocalRemove(key));

    safeLocalRemove("usuario");
    safeLocalRemove("licenciaVencida");
    safeLocalRemove("licenciaVencimientoNum");
    safeLocalRemove(LAST_ACTIVITY_KEY);

    try {
      sessionStorage.clear();
    } catch {
      // noop
    }
  }

  async function logout(options = {}) {
    if (logoutInProgress) return;
    logoutInProgress = true;

    const redirect = options.redirect !== false;
    const reason = String(options.reason || "manual").toLowerCase();

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
    } catch {
      // noop
    } finally {
      purgeClientSession({ preserveSafe: true });
      logoutInProgress = false;
    }

    if (!redirect) return;

    if (reason === "inactividad") {
      try {
        alert("Sesion cerrada por inactividad.");
      } catch {
        // noop
      }
    }

    window.location.href = LOGIN_URL;
  }

  function rememberLoginContext(context = {}) {
    const empresaId = String(context.empresaId || "").trim();
    const empresaNombre = String(context.empresaNombre || "").trim();
    const terminalId = String(context.terminalId || "").trim();
    const usuarioVisible = String(context.usuarioVisible || "").trim();

    if (empresaId) safeLocalSet("empresaId", empresaId);
    if (empresaNombre) safeLocalSet("empresaNombre", empresaNombre);
    if (terminalId) safeLocalSet("terminalId", terminalId);
    if (usuarioVisible) safeLocalSet(LAST_VISIBLE_USER_KEY, usuarioVisible);
  }

  function persistSessionUser(user) {
    if (!user || typeof user !== "object") return;

    try {
      localStorage.setItem("usuario", JSON.stringify(user));
    } catch {
      // noop
    }

    rememberLoginContext({
      empresaId: user.empresa_id,
      empresaNombre: user.empresa_nombre,
      terminalId: user.terminal_id,
      usuarioVisible: user.usuario || user.nombre || ""
    });
  }

  function bindActivityListeners() {
    if (activityBound) return;
    activityBound = true;

    const events = ["click", "keydown", "pointerdown", "touchstart", "scroll", "mousemove"];
    let lastWriteTs = 0;

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWriteTs < 1000) return;
      lastWriteTs = now;
      touchActivity();
    };

    events.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true, capture: true });
    });

    touchActivity();
  }

  function startIdleGuard(options = {}) {
    if (window.location.pathname === LOGIN_URL) return;

    const cfg = window.SoftSysAppConfig || {};
    const timeoutMs = Number(options.timeoutMs || cfg.idleTimeoutMs || 0);
    const checkMs = Number(options.checkMs || cfg.idleCheckMs || 30000);

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return;

    bindActivityListeners();

    if (idleIntervalId) {
      clearInterval(idleIntervalId);
      idleIntervalId = null;
    }

    idleIntervalId = setInterval(() => {
      const lastActivity = getLastActivityTs();
      if (!lastActivity) {
        touchActivity();
        return;
      }

      if (Date.now() - lastActivity > timeoutMs) {
        clearInterval(idleIntervalId);
        idleIntervalId = null;
        logout({ reason: "inactividad", redirect: true });
      }
    }, Math.max(10000, checkMs));
  }

  window.SoftSysSession = {
    SAFE_LOCAL_KEYS: Array.from(SAFE_LOCAL_KEYS),
    rememberLoginContext,
    persistSessionUser,
    purgeClientSession,
    touchActivity,
    startIdleGuard,
    logout
  };
})(window);
