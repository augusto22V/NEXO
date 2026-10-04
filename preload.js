'use strict';

/**
 * Preload script — se carga en TODAS las ventanas (main y popups).
 * Expone window.__electronAPI.setStorage(key, value) para que los popups
 * puedan enviar datos al proceso principal via IPC antes de cerrarse.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__electronAPI', {
  /**
   * Escribe una clave en el localStorage de la ventana principal.
   */
  setStorage: (key, value) => ipcRenderer.invoke('set-main-storage', { key, value }),

  /**
   * Reinicia el proceso backend Node.js sin cerrar la ventana.
   */
  restartServer: () => ipcRenderer.invoke('restart-server'),

  /**
   * Guarda un archivo en disco usando el diálogo nativo de Electron.
   * @param {string} fileName - Nombre sugerido del archivo
   * @param {string} base64 - Contenido del archivo en base64
   * @returns {Promise<{ok:boolean, path?:string, cancelled?:boolean}>}
   */
  saveFile: (fileName, base64) => ipcRenderer.invoke('save-file', { fileName, base64 })
});
