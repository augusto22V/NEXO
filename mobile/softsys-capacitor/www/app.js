(function () {
  const KEY = "softsys_lan_server";
  const KEY_LOCK = "softsys_lan_server_locked_v1";
  const RETRY_MS = 5000;
  const DEFAULT_APP_CONFIG = {
    appName: "SoftSys",
    setupDescription: "Configura o valida el servidor local.",
    setupHint: "Ejemplo: http://192.168.X.X:3000",
    fixedBaseUrl: "",
    serverMode: "local",
    baseUrlLabel: "URL del servidor",
    baseUrlPlaceholder: "https://mi-servidor.com",
    ipLabel: "IP del servidor",
    ipPlaceholder: "192.168.1.50",
    portLabel: "Puerto",
    defaultPort: 3000
  };

  const setupScreen = document.getElementById("setupScreen");
  const setupTitle = document.getElementById("setupTitle");
  const setupDescription = document.getElementById("setupDescription");
  const setupHint = document.getElementById("setupHint");
  const serverConfigGroup = document.getElementById("serverConfigGroup");
  const savedServerInfo = document.getElementById("savedServerInfo");
  const technicalHint = document.getElementById("technicalHint");

  const serverBaseUrlGroup = document.getElementById("serverBaseUrlGroup");
  const serverBaseUrlLabel = document.getElementById("serverBaseUrlLabel");
  const serverBaseUrl = document.getElementById("serverBaseUrl");
  const serverIpGroup = document.getElementById("serverIpGroup");
  const serverIpLabel = document.getElementById("serverIpLabel");
  const serverIp = document.getElementById("serverIp");
  const serverPortGroup = document.getElementById("serverPortGroup");
  const serverPortLabel = document.getElementById("serverPortLabel");
  const serverPort = document.getElementById("serverPort");
  const setupStatus = document.getElementById("setupStatus");

  const btnConnect = document.getElementById("btnConnect");
  const btnRetry = document.getElementById("btnRetry");
  const btnScan = document.getElementById("btnScan");

  const connIndicator = document.getElementById("connIndicator");
  const connText = document.getElementById("connText");
  const wifiBadge = document.getElementById("wifiBadge");
  const wifiIcon = document.getElementById("wifiIcon");

  const loadingOverlay = document.getElementById("loadingOverlay");

  let autoRetryTimer = null;
  let technicalModeEnabled = false;
  let currentBaseUrl = "";
  let checkingInProgress = false;
  let titleTapCount = 0;
  let titleTapTimer = null;
  let appConfig = { ...DEFAULT_APP_CONFIG };

  function getStartFlags() {
    const params = new URLSearchParams(window.location.search);
    const reconnect = params.get("reconnect") === "1";
    return { reconnect };
  }

  function showSetup(message) {
    setLoading(false);
    if (setupScreen) setupScreen.classList.remove("hidden");
    if (setupStatus) setupStatus.textContent = message || "";
  }

  function isLocked() {
    return localStorage.getItem(KEY_LOCK) === "1";
  }

  function setLocked(value) {
    localStorage.setItem(KEY_LOCK, value ? "1" : "0");
  }

  function normalizeIp(raw) {
    const value = String(raw || "").trim();
    const match = value.match(/^(\d{1,3}\.){3}\d{1,3}$/);
    if (!match) return null;

    const parts = value.split(".").map(Number);
    if (parts.some((n) => n < 0 || n > 255)) return null;
    return parts.join(".");
  }

  function normalizeBaseUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";

    try {
      const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
      const parsed = new URL(candidate);
      return parsed.toString().replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  function normalizeServerMode(rawMode, fixedBaseUrl) {
    const mode = String(rawMode || "").trim().toLowerCase();

    if (mode === "baseurl" || mode === "base_url" || mode === "base-url" || mode === "remote") {
      return "baseUrl";
    }

    if (mode === "local") {
      return "local";
    }

    return fixedBaseUrl ? "baseUrl" : "local";
  }

  function isBaseUrlMode() {
    return appConfig.serverMode === "baseUrl";
  }

  function getDefaultPort() {
    const port = Number(appConfig.defaultPort);
    return port > 0 ? port : 3000;
  }

  function getDefaultBaseUrl() {
    return normalizeBaseUrl(appConfig.fixedBaseUrl || "");
  }

  async function loadAppConfig() {
    try {
      const res = await fetch("./mobile-config.json", {
        cache: "no-store"
      });

      if (!res.ok) {
        return { ...DEFAULT_APP_CONFIG };
      }

      const raw = await res.json();
      const fixedBaseUrl = normalizeBaseUrl(raw.fixedBaseUrl || raw.baseUrl || "");
      const serverMode = normalizeServerMode(raw.serverMode, fixedBaseUrl);

      return {
        ...DEFAULT_APP_CONFIG,
        ...raw,
        fixedBaseUrl,
        serverMode
      };
    } catch {
      return { ...DEFAULT_APP_CONFIG };
    }
  }

  function applyInputModeUi() {
    const baseUrlMode = isBaseUrlMode();

    if (serverBaseUrlGroup) {
      serverBaseUrlGroup.classList.toggle("hidden", !baseUrlMode);
    }

    if (serverIpGroup) {
      serverIpGroup.classList.toggle("hidden", baseUrlMode);
    }

    if (serverPortGroup) {
      serverPortGroup.classList.toggle("hidden", baseUrlMode);
    }
  }

  function applyAppConfig() {
    if (document.title) {
      document.title = appConfig.appName || DEFAULT_APP_CONFIG.appName;
    }

    if (setupTitle) {
      setupTitle.textContent = appConfig.appName || DEFAULT_APP_CONFIG.appName;
    }

    if (setupDescription) {
      setupDescription.textContent =
        appConfig.setupDescription || DEFAULT_APP_CONFIG.setupDescription;
    }

    if (setupHint) {
      setupHint.textContent = appConfig.setupHint || DEFAULT_APP_CONFIG.setupHint;
    }

    if (serverBaseUrlLabel) {
      serverBaseUrlLabel.textContent = appConfig.baseUrlLabel || DEFAULT_APP_CONFIG.baseUrlLabel;
    }

    if (serverBaseUrl) {
      serverBaseUrl.placeholder =
        appConfig.baseUrlPlaceholder || DEFAULT_APP_CONFIG.baseUrlPlaceholder;
    }

    if (serverIpLabel) {
      serverIpLabel.textContent = appConfig.ipLabel || DEFAULT_APP_CONFIG.ipLabel;
    }

    if (serverIp) {
      serverIp.placeholder = appConfig.ipPlaceholder || DEFAULT_APP_CONFIG.ipPlaceholder;
    }

    if (serverPortLabel) {
      serverPortLabel.textContent = appConfig.portLabel || DEFAULT_APP_CONFIG.portLabel;
    }

    if (serverPort && !serverPort.value) {
      serverPort.value = String(getDefaultPort());
    }

    applyInputModeUi();
  }

  function buildBaseUrl(ip, port) {
    const safePort = Number(port) > 0 ? Number(port) : getDefaultPort();
    return `http://${ip}:${safePort}`;
  }

  function getBaseUrlFromServerConfig(cfg) {
    if (!cfg) return "";

    if (cfg.baseUrl) {
      return normalizeBaseUrl(cfg.baseUrl);
    }

    if (cfg.ip) {
      return buildBaseUrl(cfg.ip, cfg.port || getDefaultPort());
    }

    return "";
  }

  function saveServer(cfg) {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  }

  function getSavedServer() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed) return null;

      if (parsed.baseUrl) {
        const baseUrl = normalizeBaseUrl(parsed.baseUrl);
        if (!baseUrl) return null;
        return { mode: "baseUrl", baseUrl };
      }

      const ip = normalizeIp(parsed.ip);
      if (!ip) return null;

      return {
        mode: "local",
        ip,
        port: Number(parsed.port) > 0 ? Number(parsed.port) : getDefaultPort()
      };
    } catch {
      return null;
    }
  }

  function populateServerInputs(saved) {
    if (isBaseUrlMode()) {
      if (serverBaseUrl) {
        serverBaseUrl.value = (saved && saved.baseUrl) || getDefaultBaseUrl() || "";
      }
      return;
    }

    if (serverIp) {
      serverIp.value = (saved && saved.ip) || "";
    }

    if (serverPort) {
      serverPort.value = String((saved && saved.port) || getDefaultPort());
    }
  }

  function setLoading(loading) {
    if (!loadingOverlay) return;
    if (loading) loadingOverlay.classList.remove("hidden");
    else loadingOverlay.classList.add("hidden");
  }

  function setConnectionIndicator(state, label) {
    if (connIndicator && connText) {
      connIndicator.classList.remove("connected", "disconnected", "checking");
      connIndicator.classList.add(state);
      connText.textContent = label || "";
    }

    if (wifiBadge && wifiIcon) {
      wifiBadge.classList.remove("connected", "disconnected", "checking");
      wifiBadge.classList.add(state);
      wifiIcon.textContent = state === "connected" ? "wifi" : state === "checking" ? "wifi_find" : "wifi_off";
    }
  }

  function applyLockUi() {
    const saved = getSavedServer();
    const locked = Boolean(saved) && isLocked();
    const canEdit = !locked || technicalModeEnabled;

    if (serverConfigGroup) {
      serverConfigGroup.classList.toggle("hidden", !canEdit);
    }

    if (btnScan) {
      btnScan.classList.toggle("hidden", isBaseUrlMode() || !canEdit);
    }

    if (btnConnect) {
      btnConnect.textContent = canEdit ? "Guardar y conectar" : "Servidor bloqueado";
      btnConnect.disabled = !canEdit;
    }

    if (savedServerInfo) {
      const savedUrl = getBaseUrlFromServerConfig(saved);
      savedServerInfo.textContent = savedUrl ? `Servidor guardado: ${savedUrl}` : "";
      savedServerInfo.classList.toggle("hidden", !savedUrl);
    }

    if (technicalHint) {
      technicalHint.classList.toggle("hidden", !locked || canEdit);
    }
  }

  function stopAutoRetry() {
    if (autoRetryTimer) {
      clearInterval(autoRetryTimer);
      autoRetryTimer = null;
    }
  }

  function startAutoRetry() {
    stopAutoRetry();
    if (!currentBaseUrl) return;

    autoRetryTimer = setInterval(async () => {
      if (document.hidden) return;
      await verifyServerAndMaybeOpen({ auto: true, navigateOnSuccess: true });
    }, RETRY_MS);
  }

  async function checkServer(baseUrl, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 4000);

    try {
      const res = await fetch(`${baseUrl}/api/health`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store"
        }
      });

      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      return !!(data && data.ok === true);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  function openInMainWebView(baseUrl) {
    const loginUrl = `${baseUrl}/login/login.html`;
    window.location.href = loginUrl;
  }

  async function verifyServerAndMaybeOpen(options = {}) {
    const auto = Boolean(options.auto);
    const navigateOnSuccess = options.navigateOnSuccess !== false;
    const reconnectMode = Boolean(options.reconnectMode);
    const remoteMode = isBaseUrlMode();

    if (!currentBaseUrl) {
      setConnectionIndicator("disconnected", "Servidor no configurado");
      showSetup(remoteMode ? "Configura la URL del servidor para iniciar." : "Configura IP y puerto del servidor para iniciar.");
      return false;
    }

    if (checkingInProgress) return false;
    checkingInProgress = true;

    if (!auto) setLoading(true);
    setConnectionIndicator("checking", "Verificando...");
    if (setupStatus) {
      setupStatus.textContent = reconnectMode
        ? `Reconectando con el servidor ${remoteMode ? "remoto" : ""}...`.trim()
        : `Verificando conexion con el servidor ${remoteMode ? "remoto" : ""}...`.trim();
    }

    const ok = await checkServer(currentBaseUrl, 5000);
    checkingInProgress = false;
    if (!auto) setLoading(false);

    if (ok) {
      setConnectionIndicator("connected", "Conectado");
      if (setupStatus) setupStatus.textContent = "Servidor disponible. Ingresando...";
      stopAutoRetry();
      if (navigateOnSuccess) {
        openInMainWebView(currentBaseUrl);
      }
      return true;
    }

    setConnectionIndicator("disconnected", "Sin conexion");
    if (setupStatus) {
      setupStatus.textContent =
        "Servidor no disponible. Reintentando automaticamente cada 5s.";
    }

    showSetup(setupStatus ? setupStatus.textContent : "");
    startAutoRetry();
    return false;
  }

  async function connectWithInputs() {
    const saved = getSavedServer();
    if (saved && isLocked() && !technicalModeEnabled) {
      currentBaseUrl = getBaseUrlFromServerConfig(saved);
      await verifyServerAndMaybeOpen({
        auto: false,
        navigateOnSuccess: true,
        reconnectMode: true
      });
      return;
    }

    if (isBaseUrlMode()) {
      const baseUrl = normalizeBaseUrl(serverBaseUrl ? serverBaseUrl.value : "");

      if (!baseUrl) {
        showSetup("URL invalida. Ejemplo: https://mi-servidor.com");
        setConnectionIndicator("disconnected", "Sin conexion");
        return;
      }

      const cfg = { mode: "baseUrl", baseUrl };
      saveServer(cfg);
      setLocked(true);

      currentBaseUrl = baseUrl;
      applyLockUi();
      await verifyServerAndMaybeOpen({ auto: false, navigateOnSuccess: true });
      return;
    }

    const ip = normalizeIp(serverIp ? serverIp.value : "");
    const port = Number(serverPort ? serverPort.value : 0) || getDefaultPort();

    if (!ip) {
      showSetup("IP invalida. Ejemplo: 192.168.1.50");
      setConnectionIndicator("disconnected", "Sin conexion");
      return;
    }

    const cfg = { mode: "local", ip, port };
    saveServer(cfg);
    setLocked(true);

    currentBaseUrl = buildBaseUrl(ip, port);
    applyLockUi();
    await verifyServerAndMaybeOpen({ auto: false, navigateOnSuccess: true });
  }

  async function reintentarConexion() {
    const saved = getSavedServer();
    if (!saved) {
      showSetup(isBaseUrlMode() ? "Configura la URL del servidor para iniciar." : "Configura IP y puerto del servidor para iniciar.");
      setConnectionIndicator("disconnected", "Sin conexion");
      return;
    }

    currentBaseUrl = getBaseUrlFromServerConfig(saved);
    await verifyServerAndMaybeOpen({
      auto: false,
      navigateOnSuccess: true,
      reconnectMode: true
    });
  }

  async function quickScanCandidates() {
    if (isBaseUrlMode() || (!technicalModeEnabled && isLocked())) return;

    if (setupStatus) setupStatus.textContent = "Buscando servidor en IPs comunes...";
    setConnectionIndicator("checking", "Verificando...");

    const fromInput = normalizeIp(serverIp ? serverIp.value : "");
    const candidates = [];

    if (fromInput) {
      const parts = fromInput.split(".");
      const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
      [2, 10, 20, 50, 100, 101, 200, 254].forEach((n) => {
        candidates.push(`${prefix}.${n}`);
      });
    }

    [
      "192.168.0.2",
      "192.168.0.10",
      "192.168.1.2",
      "192.168.1.10",
      "192.168.1.50",
      "192.168.1.100",
      "10.0.0.2",
      "10.0.0.10"
    ].forEach((ip) => candidates.push(ip));

    const unique = Array.from(new Set(candidates));

    for (let i = 0; i < unique.length; i += 1) {
      const ip = unique[i];
      const baseUrl = buildBaseUrl(ip, Number(serverPort ? serverPort.value : 0) || getDefaultPort());
      if (setupStatus) setupStatus.textContent = `Probando ${baseUrl} ...`;
      const ok = await checkServer(baseUrl, 1200);

      if (ok) {
        if (serverIp) serverIp.value = ip;
        if (setupStatus) setupStatus.textContent = `Servidor detectado: ${baseUrl}`;
        setConnectionIndicator("connected", "Conectado");
        return;
      }
    }

    if (setupStatus) {
      setupStatus.textContent = "No se detecto servidor automaticamente. Ingresa la IP manualmente.";
    }
    setConnectionIndicator("disconnected", "Sin conexion");
  }

  function enableTechnicalModeTemporarily() {
    technicalModeEnabled = true;
    applyLockUi();
    if (setupStatus) {
      setupStatus.textContent = isBaseUrlMode()
        ? "Modo tecnico habilitado temporalmente. Puedes editar la URL del servidor."
        : "Modo tecnico habilitado temporalmente. Puedes editar IP y puerto.";
    }
  }

  function bindTechnicalModeUnlock() {
    if (!setupTitle) return;

    setupTitle.addEventListener("click", () => {
      titleTapCount += 1;

      if (titleTapTimer) clearTimeout(titleTapTimer);
      titleTapTimer = setTimeout(() => {
        titleTapCount = 0;
      }, 2500);

      if (titleTapCount >= 7) {
        titleTapCount = 0;
        enableTechnicalModeTemporarily();
      }
    });
  }

  if (btnConnect) btnConnect.addEventListener("click", connectWithInputs);
  if (btnRetry) btnRetry.addEventListener("click", reintentarConexion);
  if (btnScan) btnScan.addEventListener("click", quickScanCandidates);

  window.addEventListener("online", () => {
    if (currentBaseUrl) {
      verifyServerAndMaybeOpen({ auto: true, navigateOnSuccess: true, reconnectMode: true });
    }
  });

  window.addEventListener("offline", () => {
    setConnectionIndicator("disconnected", "Sin red");
    showSetup("Conexion de red no disponible en el dispositivo.");
    startAutoRetry();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentBaseUrl) {
      verifyServerAndMaybeOpen({ auto: true, navigateOnSuccess: true, reconnectMode: true });
    }
  });

  window.addEventListener("load", async () => {
    const startFlags = getStartFlags();
    bindTechnicalModeUnlock();

    appConfig = await loadAppConfig();
    applyAppConfig();

    const saved = getSavedServer();
    populateServerInputs(saved);

    if (!saved) {
      setConnectionIndicator("disconnected", "Sin conexion");
      showSetup(isBaseUrlMode() ? "Configura la URL del servidor para iniciar." : "Configura la IP del servidor local para iniciar.");
      applyLockUi();
      return;
    }

    if (!isLocked()) {
      // Compatibilidad: versiones anteriores guardaban servidor sin flag de bloqueo.
      setLocked(true);
    }

    currentBaseUrl = getBaseUrlFromServerConfig(saved);
    applyLockUi();

    if (startFlags.reconnect && setupStatus) {
      setupStatus.textContent = "Conexion interrumpida. Intentando reconectar con el servidor...";
    }

    await verifyServerAndMaybeOpen({
      auto: false,
      navigateOnSuccess: true,
      reconnectMode: startFlags.reconnect
    });
  });
})();
