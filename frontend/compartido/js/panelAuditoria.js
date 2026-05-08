(function () {
  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(
      date.getHours()
    )}:${pad2(date.getMinutes())}`;
  }

  function textOrDash(value) {
    if (value == null || value === "") return "-";
    return String(value);
  }

  function guessTableFromPath() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("/cliente/")) return "cliente";
    if (path.includes("/proveedores/")) return "proveedor";
    if (path.includes("/comprador/")) return "comprador";
    if (path.includes("/vendedor/")) return "vendedor";
    if (path.includes("/categorias/")) return "categoria";
    if (path.includes("/productos/")) return "producto";
    if (path.includes("/parametros/operacion")) return "tipo_operacion";
    if (path.includes("/parametros/forma_pago")) return "condicion_pago";
    if (path.includes("/tipo_pedido/")) return "tipo_pedido";
    if (path.includes("/compra/")) return "compra";
    if (path.includes("/config/empresa/")) return "empresa";
    if (path.includes("/config/terminal/")) return "terminal";
    if (path.includes("/config/usuarios/")) return "usuario";
    if (path.includes("/modelo_factura/")) return "modelo_factura";
    if (path.includes("/precio/")) return "producto";
    return "";
  }

  class PanelAuditoria extends HTMLElement {
    constructor() {
      super();
      this._ready = false;
      this._recordId = "";
      this._lastLoadedKey = "";
      this._pollTimer = null;
      this._state = {
        usuario_creacion_id: null,
        usuario_creacion: null,
        fecha_creacion: null,
        usuario_modificacion_id: null,
        usuario_modificacion: null,
        fecha_modificacion: null,
      };
    }

    connectedCallback() {
      if (this._ready) return;
      this._ready = true;
      this._table = this.dataset.tabla || guessTableFromPath();
      this._idInputId = this.dataset.idInput || "";
      this.clear();
      this.startWatcher();
      this.bindSaveRefresh();
    }

    disconnectedCallback() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    }

    clear() {
      this._recordId = "";
      this._lastLoadedKey = "";
      this._state = {
        usuario_creacion_id: null,
        usuario_creacion: null,
        fecha_creacion: null,
        usuario_modificacion_id: null,
        usuario_modificacion: null,
        fecha_modificacion: null,
      };
      this.render();
    }

    setRecordId(id) {
      const value = id == null ? "" : String(id).trim();
      if (!value) {
        this.clear();
        return;
      }
      this._recordId = value;
      this.refresh();
    }

    SetAuditoria(tabla, recordId) {
      if (tabla) this._table = String(tabla);
      this.setRecordId(recordId);
    }

    getIdInputElement() {
      if (this._idInputId) {
        const el = document.getElementById(this._idInputId);
        if (el) return el;
      }

      const candidates = [
        "clienteId",
        "proveedorId",
        "compradorId",
        "vendedorId",
        "categoriaId",
        "productoId",
        "operacionId",
        "formaPagoId",
        "tipoPedidoId",
        "compraId",
        "id",
      ];

      for (const id of candidates) {
        const el = document.getElementById(id);
        if (el) return el;
      }
      return null;
    }

    startWatcher() {
      const readId = () => {
        const input = this.getIdInputElement();
        const value = input?.value == null ? "" : String(input.value).trim();
        if (!value) {
          if (this._recordId) this.clear();
          return;
        }
        if (value !== this._recordId) {
          this.setRecordId(value);
        }
      };

      readId();
      this._pollTimer = setInterval(readId, 400);
    }

    bindSaveRefresh() {
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const button = target.closest("button");
        if (!button) return;

        const text = `${button.id || ""} ${button.className || ""} ${button.title || ""} ${
          button.textContent || ""
        }`.toLowerCase();

        if (text.includes("guardar")) {
          setTimeout(() => this.refresh(true), 300);
          setTimeout(() => this.refresh(true), 1200);
        }
      });
    }

    async refresh(force = false) {
      if (!this._table || !this._recordId) return;
      const key = `${this._table}:${this._recordId}`;
      if (!force && key === this._lastLoadedKey) return;

      try {
        const response = await fetch(
          `/api/auditoria/resumen/${encodeURIComponent(this._table)}/${encodeURIComponent(
            this._recordId
          )}`,
          { credentials: "include" }
        );

        if (!response.ok) return;
        const data = await response.json();
        this._state = {
          usuario_creacion_id: data.usuario_creacion_id ?? null,
          usuario_creacion: data.usuario_creacion ?? null,
          fecha_creacion: data.fecha_creacion ?? null,
          usuario_modificacion_id: data.usuario_modificacion_id ?? null,
          usuario_modificacion: data.usuario_modificacion ?? null,
          fecha_modificacion: data.fecha_modificacion ?? null,
        };
        this._lastLoadedKey = key;
        this.render();
      } catch (_error) {
        // Silencioso para no interrumpir formularios.
      }
    }

    escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

render() {
  const cUser = textOrDash(this._state.usuario_creacion_id ?? this._state.usuario_creacion);
  const cDate = formatDateTime(this._state.fecha_creacion);
  const mUser = textOrDash(this._state.usuario_modificacion_id ?? this._state.usuario_modificacion);
  const mDate = formatDateTime(this._state.fecha_modificacion);

  let user = "-";
  let date = "";

  // Prioridad: MODIFICACIÓN > CREACIÓN
  if (mDate) {
    user = mUser;
    date = mDate;
  } else if (cDate) {
    user = cUser;
    date = cDate;
  }

  const line = date
    ? `Creado/Modificado: ${this.escapeHtml(user)} ${this.escapeHtml(date)}`
    : "";

  this.innerHTML = `
    <div class="panel-auditoria">
      <span class="panel-auditoria-status">${line}</span>
    </div>
  `;
}
}


  if (!customElements.get("panel-auditoria")) {
    customElements.define("panel-auditoria", PanelAuditoria);
  }

  window.refrescarAuditoriaPantalla = function refrescarAuditoriaPantalla() {
    document.querySelectorAll("panel-auditoria").forEach((panel) => {
      if (typeof panel.refresh === "function") panel.refresh();
    });
  };

  window.setAuditoriaEnPantalla = function setAuditoriaEnPantalla(tabla, recordId) {
    document.querySelectorAll("panel-auditoria").forEach((panel) => {
      if (typeof panel.SetAuditoria === "function") panel.SetAuditoria(tabla, recordId);
    });
  };
})();
