'use strict';

/**
 * LibreriaSys — Electron entry point
 *
 * Arranca el backend Express (usando Node.js del sistema) y abre una
 * BrowserWindow en http://localhost:<PORT>. Si PM2 ya tiene el servidor
 * corriendo, omite el spawn y abre la ventana directamente.
 * La app queda en la bandeja del sistema al cerrar la ventana.
 */

const {
  app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog,
} = require('electron');
const { spawn } = require('child_process');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');

// ─── Configuración ───────────────────────────────────────────────────────────

const PORT        = 3001;
const LOGIN_URL   = `http://localhost:${PORT}/login/login.html`;
const BACKEND_DIR = path.join(__dirname, 'backend');
const ICON_PATH   = path.join(__dirname, 'frontend', 'recursos', 'img', 'alpx-logo.ico');

// ─── Estado global ───────────────────────────────────────────────────────────

let mainWindow  = null;
let tray        = null;
let backendProc = null;
let isQuitting  = false;

// ─── Backend ─────────────────────────────────────────────────────────────────

function startBackend() {
  const nodeExe = process.platform === 'win32' ? 'node.exe' : 'node';

  backendProc = spawn(nodeExe, ['app.js'], {
    cwd: BACKEND_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProc.stdout.on('data', (chunk) =>
    process.stdout.write('[server] ' + chunk.toString()));
  backendProc.stderr.on('data', (chunk) =>
    process.stderr.write('[server] ' + chunk.toString()));

  backendProc.on('close', (code) => {
    if (!isQuitting) {
      console.warn(`[server] Proceso cerrado (código ${code}) — reiniciando en 2 s…`);
      setTimeout(startBackend, 2000);
    }
  });
}

function stopBackend() {
  if (backendProc) {
    backendProc.removeAllListeners('close');
    try { backendProc.kill('SIGTERM'); } catch (_) {}
    backendProc = null;
  }
}

// ─── Detección de backend ya corriendo (ej: PM2) ─────────────────────────────

function isBackendAlreadyRunning() {
  return new Promise((resolve) => {
    const req = http.get(LOGIN_URL, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.setTimeout(1200, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// ─── Esperar que el backend responda ─────────────────────────────────────────

function waitForBackend(timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(LOGIN_URL, (res) => {
        res.resume();
        if (res.statusCode < 500) resolve();
        else retry();
      });
      req.on('error', retry);
      req.end();
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error('El servidor no respondió a tiempo.'));
      } else {
        setTimeout(probe, 400);
      }
    };
    probe();
  });
}

// ─── Ventana principal ───────────────────────────────────────────────────────

function buildIcon() {
  if (fs.existsSync(ICON_PATH)) return nativeImage.createFromPath(ICON_PATH);
  return undefined;
}

function createWindow() {
  // Quitar el menú nativo (File / Edit / View / Window / Help)
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    icon: buildIcon(),
    title: 'ALPX Systems',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadURL(LOGIN_URL);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Ocultar en lugar de cerrar (queda en tray)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ─── Bandeja del sistema (tray) ───────────────────────────────────────────────

function createTray() {
  const iconImg = fs.existsSync(ICON_PATH)
    ? nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(iconImg);
  tray.setToolTip('ALPX Systems');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Abrir ALPX Systems',
      click() {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      },
    },
    {
      label: 'Abrir en navegador',
      click() { shell.openExternal(LOGIN_URL); },
    },
    { type: 'separator' },
    {
      label: 'Reiniciar servidor',
      click() {
        stopBackend();
        setTimeout(() => {
          startBackend();
          if (mainWindow) {
            waitForBackend(15000)
              .then(() => mainWindow && mainWindow.reload())
              .catch(() => {});
          }
        }, 500);
      },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click() {
        isQuitting = true;
        stopBackend();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ─── Ciclo de vida de Electron ────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Tray aparece inmediatamente (feedback visual desde el inicio)
  createTray();

  // Si PM2 (u otro proceso) ya sirve el backend, no duplicamos
  const yaRunning = await isBackendAlreadyRunning();
  if (yaRunning) {
    console.log(`[main] Backend ya detectado en :${PORT} — omitiendo spawn.`);
  } else {
    startBackend();
    try {
      await waitForBackend(20000);
    } catch (err) {
      dialog.showErrorBox(
        'Error al iniciar ALPX Systems',
        `El servidor backend no pudo iniciarse.\n\n${err.message}\n\n` +
        `Verifique que:\n` +
        `  • Node.js está instalado (ejecute: node -v)\n` +
        `  • El puerto ${PORT} no está en uso\n` +
        `  • PostgreSQL está activo`,
      );
      isQuitting = true;
      app.quit();
      return;
    }
  }

  createWindow();
});

// Mantener la app viva en tray aunque se cierren las ventanas
app.on('window-all-closed', () => { /* no hacer nada */ });

// macOS: re-mostrar al hacer clic en el dock
app.on('activate', () => {
  if (mainWindow) mainWindow.show();
});

// Limpiar proceso hijo al salir definitivamente
app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});
