(function attachTipoPedidoVenta(globalScope) {
  "use strict";

  function toPositiveInt(value, fallback = 0) {
    const n = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function normalizeNombre(value) {
    return String(value ?? "").trim();
  }

  function normalizeItems(rawItems) {
    const list = Array.isArray(rawItems) ? rawItems : [];
    return list
      .map((item) => ({
        id: toPositiveInt(item?.id, 0),
        nombre: normalizeNombre(item?.nombre),
        descripcion: item?.descripcion == null ? "" : String(item.descripcion)
      }))
      .filter((item) => item.id > 0 && item.nombre.length > 0);
  }

  function renderSelect(selectEl, items) {
    if (!selectEl) return;
    selectEl.innerHTML = "";

    for (const item of items) {
      const option = document.createElement("option");
      option.value = String(item.id);
      option.textContent = item.nombre;
      selectEl.appendChild(option);
    }
  }

  function selectByPreference(selectEl, items, preferredId, defaultId) {
    if (!selectEl || !items.length) return 0;

    const preferred = toPositiveInt(preferredId, 0);
    const fallback = toPositiveInt(defaultId, 0) || items[0].id;
    const target = preferred > 0 ? preferred : fallback;

    const exists = items.some((item) => item.id === target);
    const finalId = exists ? target : fallback;
    selectEl.value = String(finalId);
    return finalId;
  }

  async function loadTiposPedido(selectEl, options = {}) {
    const endpoint = options.endpoint || "/api/venta/tipos-pedido";
    const preferredId = toPositiveInt(options.selectedId, 0);

    const res = await fetch(endpoint, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || "No se pudo cargar tipo de pedido");
    }

    const items = normalizeItems(Array.isArray(payload) ? payload : payload.items);
    renderSelect(selectEl, items);

    const backendDefault = toPositiveInt(payload?.default_id, 0);
    const defaultId = backendDefault > 0 ? backendDefault : (items[0]?.id || 0);
    const selectedId = selectByPreference(selectEl, items, preferredId, defaultId);

    return { items, defaultId, selectedId };
  }

  function ensureSelectedId(selectEl, fallbackId = 0) {
    const selected = toPositiveInt(selectEl?.value, 0);
    if (selected > 0) return selected;

    const fallback = toPositiveInt(fallbackId, 0);
    if (fallback > 0 && selectEl) {
      const exists = Array.from(selectEl.options || []).some((opt) => toPositiveInt(opt.value, 0) === fallback);
      if (exists) {
        selectEl.value = String(fallback);
        return fallback;
      }
    }

    const first = toPositiveInt(selectEl?.options?.[0]?.value, 0);
    if (first > 0 && selectEl) {
      selectEl.value = String(first);
      return first;
    }

    return 0;
  }

  globalScope.TipoPedidoVenta = {
    loadTiposPedido,
    ensureSelectedId,
    toPositiveInt
  };
})(window);
