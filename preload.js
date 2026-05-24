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
   * Retorna una Promise que resuelve CUANDO el valor ya está escrito —
   * el popup puede llamar window.close() inmediatamente después.
   */
  setStorage: (key, value) => ipcRenderer.invoke('set-main-storage', { key, value })
});
