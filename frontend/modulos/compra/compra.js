    
    
    const API = "/api/compra";

/* ================== DOM SAFE ================== */
function $(id) {
  const el = document.getElementById(id);
  return el;
}

const buscador = $("buscador");
const categoriaSelect = $("categoriaSelect");
const contProductos = $("productos");
const ventaBody = $("ventaBody");
const spanTotal = $("total");
const cantItems = $("cantItems");
const cantProductos = $("cantProductos");
const clienteCodigo = $("clienteCodigo");
const clienteNombre = $("clienteNombre");
const tipoVenta = $("tipoVenta");
const formaPago = $("formaPago");
const fechaVenta = $("fechaVenta");
const estadoVenta = $("estadoVenta");
const ventaEstado = $("ventaEstado");
const catGrid = document.getElementById("catGrid");

let categoriaActiva = "";
// toast
const toastWrap = $("toastWrap");

let productos = [];
let categorias = [];
let carrito = [];

// movimiento actual (cuando cargás desde “movimientos”)
let movActualId = null;

/* ================== HELPERS ================== */
function money(n) {
  return Number(n || 0).toLocaleString("es-PY");
}

function parseGs(v) {
  if (!v) return 0;
  return Number(String(v).replace(/\./g, "").replace(",", "."));
}

function formatGsInput(n) {
  return money(n);
}

function hoyISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

let ventaBloqueada = false;

function setBloqueoVenta(bloquear) {
  ventaBloqueada = !!bloquear;

  // Deshabilitar botones principales
  const btnEfect = document.querySelector('button[onclick="efectivizarVenta()"]');
  const btnGuardar = document.querySelector('button[onclick="guardarAbierto)"]');
  const btnVaciar = document.querySelector('button[onclick="vaciarVenta()"]');
  const btnCancelar = document.querySelector('button[onclick="cancelarVenta()"]');

  if (btnEfect) btnEfect.disabled = bloquear;
  if (btnGuardar) btnGuardar.disabled = bloquear;
  if (btnVaciar) btnVaciar.disabled = bloquear;
  if (btnCancelar) btnCancelar.disabled = bloquear;

  // Deshabilitar inputs de precios del carrito
  document.querySelectorAll(".precio-input").forEach(inp => {
    inp.disabled = bloquear;
  });

  // Deshabilitar botones +/− y borrar del carrito
  document.querySelectorAll(".cant-btn, .del-btn").forEach(b => {
    b.disabled = bloquear;
    b.style.pointerEvents = bloquear ? "none" : "";
    b.style.opacity = bloquear ? "0.5" : "";
  });

  // Deshabilitar botones "Agregar" de productos
  document.querySelectorAll("#productos button").forEach(b => {
    b.disabled = bloquear || b.disabled;
    b.style.pointerEvents = bloquear ? "none" : "";
    b.style.opacity = bloquear ? "0.6" : "";
  });


//  Bloquear campos de cabecera
[fechaVenta, tipoVenta, formaPago, clienteCodigo].forEach(el => {
  if (el) el.disabled = bloquear;
});

// botones cliente (+ y lupa)
document.querySelectorAll(".cliente-row .btn-icon").forEach(b => {
  b.disabled = bloquear;
  b.style.pointerEvents = bloquear ? "none" : "";
  b.style.opacity = bloquear ? "0.5" : "";
});

const ventaCard = document.querySelector(".venta-card");
if (ventaCard) {
  ventaCard.classList.toggle("venta-bloqueada", bloquear);
}


  if (bloquear) toast("Venta efectivizada: edición bloqueada.");
}


/* ================== TOAST ================== */
function toast(msg) {
  if (!toastWrap) {
    console.log("[TOAST]", msg);
    return;
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  toastWrap.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

/* ================== ESTADO UI ================== */
function setEstadoUI(estado) {
  if (!estadoVenta) return;

  estadoVenta.classList.remove("estado-concluido", "estado-efectivado", "estado-cancelado");

  if (estado === "EFECTIVADO") {
    estadoVenta.textContent = "EFECTIVADO";
    estadoVenta.classList.add("estado-efectivado");
    if (ventaEstado) ventaEstado.textContent = "Efectivado";
  } else if (estado === "CANCELADO") {
    estadoVenta.textContent = "CANCELADO";
    estadoVenta.classList.add("estado-cancelado");
    if (ventaEstado) ventaEstado.textContent = "Cancelado";
  } else if (estado === "ABIERTO") {
    // si querés un badge distinto para BORRADOR, podés crear CSS. Por ahora lo dejamos como “CONCLUIDO”
    estadoVenta.textContent = "CONCLUIDO";
    estadoVenta.classList.add("estado-concluido");
    if (ventaEstado) ventaEstado.textContent = "Abierto";
  } else {
    estadoVenta.textContent = "CONCLUIDO";
    estadoVenta.classList.add("estado-concluido");
    if (ventaEstado) ventaEstado.textContent = "Abierto";
  }
}

/* ================== STORAGE MOVIMIENTOS ================== */
const KEY_MOVS = "venta_movimientos";

function getMovs() {
  try { return JSON.parse(localStorage.getItem(KEY_MOVS) || "[]"); }
  catch { return []; }
}
function setMovs(list) {
  localStorage.setItem(KEY_MOVS, JSON.stringify(list));
}
function nextMovId(list) {
  const max = list.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0);
return String(max + 1);

}

function buildMovPayload(estado = "ABIERTO") {
  return {
    id: movActualId || null,
    fecha: (fechaVenta?.value) || hoyISO(),
    tipo: (tipoVenta?.value) || "CONTADO",
    pago: (formaPago?.value) || "EFECTIVO",
    cliente: {
      codigo: ((clienteCodigo?.value) || "1").trim(),

      nombre: (clienteNombre?.value) || "Consumidor final"
    },
    detalle: carrito.map(x => ({
      producto_id: x.producto.id,
      nombre: x.producto.nombre,
      cantidad: x.cantidad,
      precio_unit: Number(x.precio_unit || 0)
    })),
    total: totalVenta(),
    estado
  };
}

function guardarMovimientoLocal(estado = "ABIERTO") {
  if (carrito.length === 0) {
    toast("Carrito vacío. No hay nada para guardar.");
    return null;
  }

  const list = getMovs();
  const data = buildMovPayload(estado);

  if (!data.id) {
    data.id = nextMovId(list);
    list.unshift(data);
    movActualId = data.id;
  } else {
    const idx = list.findIndex(x => x.id === data.id);
    if (idx >= 0) list[idx] = data;
    else list.unshift(data);
  }

  setMovs(list);
  return data.id;
}

function cargarMovimientoLocal(id) {
  const list = getMovs();
  const mov = list.find(x => x.id === id);
  if (!mov) { toast("Movimiento no encontrado."); return; }

  movActualId = mov.id;

  if (fechaVenta) fechaVenta.value = mov.fecha || hoyISO();
  if (tipoVenta) tipoVenta.value = mov.tipo || "CONTADO";
  if (formaPago) formaPago.value = mov.pago || "EFECTIVO";

if (clienteCodigo) clienteCodigo.value = mov.cliente?.codigo || "1";

  if (clienteNombre) clienteNombre.value = mov.cliente?.nombre || "Consumidor final";

  carrito = (mov.detalle || []).map(d => ({
    producto: { id: d.producto_id, nombre: d.nombre },
    cantidad: Number(d.cantidad || 1),
    precio_unit: Number(d.precio_unit || 0)
  }));

renderVenta();
setEstadoUI(mov.estado || "CONCLUIDO");

// 🔒 BLOQUEO REAL SEGÚN ESTADO
setBloqueoVenta(mov.estado === "EFECTIVADO");

toast(`Movimiento ${mov.id} cargado.`);

}

/* ================== ABRIR MOVIMIENTOS (REDIRECCIÓN) ================== */
function abrirMovimientos(){
  window.location.href = "../movimientos/movimientos.html";
}

window.abrirMovimientos = abrirMovimientos;
window.abrirBuscadorMvt = abrirMovimientos;



/* ================== FETCH SAFE ================== */
async function safeFetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    toast(`Error al cargar: ${url}`);
    console.error("Fetch error:", url, e);
    return null;
  }
}

async function getProductoPorId(id) {
  const res = await fetch(`${API}/productos/${id}`);
  if (!res.ok) throw new Error(`No existe producto ${id}`);
  return await res.json();
}

async function updateProducto(id, payload) {
  const res = await fetch(`${API}/productos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`No se pudo actualizar producto ${id}`);
  return await res.json();
}

/**
 * Descuenta stock en backend según el carrito.
 * - Valida stock real del backend antes de descontar.
 * - Si falta stock, corta y no toca nada.
 */
async function descontarStockBackend(detalle) {
  // 1) Traer productos reales del backend para validar
  const productosActuales = [];
  for (const it of detalle) {
    const p = await getProductoPorId(it.producto_id);
    productosActuales.push({ p, it });
  }

  // 2) Validación de stock real
  for (const { p, it } of productosActuales) {
    const stock = Number(p.stock ?? 0);
    const cant = Number(it.cantidad ?? 0);
    if (cant <= 0) continue;

    if (stock < cant) {
      throw new Error(`Stock insuficiente para "${p.nombre}". Disponible: ${stock}, solicitado: ${cant}`);
    }
  }

  // 3) Descontar (PUT completo)
  for (const { p, it } of productosActuales) {
    const cant = Number(it.cantidad ?? 0);
    if (cant <= 0) continue;

    const nuevoStock = Number(p.stock ?? 0) - cant;

    await updateProducto(p.id, {
      ...p,
      stock: nuevoStock
    });
  }
}


/* ================== CARGA CATEGORIAS/PRODUCTOS ================== */
function renderCategorias() {
  if (!catGrid) return;

  catGrid.innerHTML = "";

  // TODAS
  const todas = document.createElement("div");
  todas.className = "cat-card";
  todas.innerHTML = `<span>Todas</span>`;
  todas.onclick = () => {
    categoriaActiva = "";
    renderCategorias();
    cargarProductos();
  };
  catGrid.appendChild(todas);

  categorias.forEach(c => {

    const card = document.createElement("div");
    card.className = "cat-card";

    if (String(categoriaActiva) === String(c.id)) {
      card.classList.add("activa");
    }

    const img = c.imagen ? `${API}${c.imagen}` : "";

    card.innerHTML = `
      ${img ? `<img src="${img}">` : ""}
      <span>${c.nombre}</span>
    `;

    card.onclick = () => {
      categoriaActiva = c.id;
      renderCategorias();
      cargarProductos();
    };

    catGrid.appendChild(card);
  });
}


async function cargarProductos() {
  if (!contProductos) return;

  const data = await safeFetchJson(`${API}/productos`);
  if (!data) {
    contProductos.innerHTML = `<div style="padding:12px;color:#999">No se pudo cargar productos.</div>`;
    return;
  }

  productos = data;

  const q = (buscador?.value || "").toLowerCase().trim();
const cat = categoriaActiva;

  let lista = [...productos];
  if (cat) lista = lista.filter(p => String(p.categoria_id) === String(cat));
  if (q) lista = lista.filter(p => (p.nombre || "").toLowerCase().includes(q));

  renderProductos(lista);
}

function renderProductos(data) {
  if (!contProductos) return;
  contProductos.innerHTML = "";

  if (!data || data.length === 0) {
    contProductos.innerHTML = `<div style="padding:12px;color:#999">Sin productos</div>`;
    return;
  }

  data.forEach(p => {
    const card = document.createElement("div");
    card.className = "producto";

    const imgName = p.imagen || "";
    const imgSrc = imgName ? `${API}/uploads/productos/${imgName}` : "";
    const precio = Number(p.precio ?? p.precio_venta ?? 0);

    card.innerHTML = `
      <div class="img">
        ${imgSrc ? `<img src="${imgSrc}" alt="${p.nombre}">` : ``}
      </div>

      <h4 title="${p.nombre}">${p.nombre}</h4>
      <div class="precio">Gs. ${money(precio)}</div>
      <div style="font-size:12px;color:#777;margin-bottom:8px;">Stock: ${p.stock ?? "-"}</div>

      <button ${Number(p.stock ?? 0) <= 0 ? "disabled" : ""}>Agregar</button>
    `;

    card.querySelector("button").onclick = () => agregarAlCarrito(p);
    contProductos.appendChild(card);
  });
}

/* ================== CARRITO + STOCK ================== */
function stockDisponible(id) {
  const p = productos.find(x => x.id === id);
  return p ? Number(p.stock ?? 0) : 0;
}
function cantEnCarrito(id) {
  const it = carrito.find(x => x.producto.id === id);
  return it ? it.cantidad : 0;
}
function puedeAgregar(id) {
  return cantEnCarrito(id) + 1 <= stockDisponible(id);
}

function agregarAlCarrito(p) {
  if (ventaBloqueada) { toast("Venta efectivizada. No se puede modificar."); return; }
  if (!puedeAgregar(p.id)) {
    toast("No hay más stock disponible para este producto.");
    return;
  }

  const i = carrito.findIndex(x => x.producto.id === p.id);
  if (i >= 0) carrito[i].cantidad += 1;
  else {
    carrito.push({
      producto: p,
      cantidad: 1,
      precio_unit: Number(p.precio ?? p.precio_venta ?? 0),
    });
  }

  renderVenta();
}

function restarItem(id) {
    if (ventaBloqueada) { toast("Venta efectivizada. No se puede modificar."); return; }
  const i = carrito.findIndex(x => x.producto.id === id);
  if (i < 0) return;

  carrito[i].cantidad -= 1;
  if (carrito[i].cantidad <= 0) carrito.splice(i, 1);
  renderVenta();
}

function sumarItem(id) {
    if (ventaBloqueada) { toast("Venta efectivizada. No se puede modificar."); return; }
  if (!puedeAgregar(id)) {
    toast("No hay más stock disponible para sumar.");
    return;
  }

  const i = carrito.findIndex(x => x.producto.id === id);
  if (i < 0) return;
  carrito[i].cantidad += 1;
  renderVenta();
}

function eliminarItem(id) {
    if (ventaBloqueada) { toast("Venta efectivizada. No se puede modificar."); return; }
  carrito = carrito.filter(x => x.producto.id !== id);
  renderVenta();
}

function totalVenta() {
  return carrito.reduce((acc, x) => acc + (Number(x.precio_unit) * x.cantidad), 0);
}

/* ================== RENDER VENTA ================== */
function renderVenta() {
  if (!ventaBody || !spanTotal || !cantItems || !cantProductos) return;

  if (carrito.length === 0) {
    ventaBody.innerHTML = `<div class="venta-vacio">Carrito vacío</div>`;
    spanTotal.textContent = "0";
    cantItems.textContent = "0";
    cantProductos.textContent = "0";
    return;
  }

  ventaBody.innerHTML = "";

  carrito.forEach((x, idx) => {
    const row = document.createElement("div");
    row.className = "venta-row";

    const subt = Number(x.precio_unit) * x.cantidad;

    row.innerHTML = `
      <div class="col-item">${idx + 1}</div>

      <div class="col-prod">
        <div class="prod-nombre" title="${x.producto.nombre}">${x.producto.nombre}</div>
        <div class="prod-stock">Stock: ${stockDisponible(x.producto.id) || "-"}</div>
      </div>

      <div class="col-cant">
        <div class="cant-box">
          <button class="cant-btn" type="button">−</button>
          <div class="cant-num">${x.cantidad}</div>
          <button class="cant-btn" type="button">+</button>
        </div>
      </div>

      <div class="col-precio">
        <input class="precio-input" value="${formatGsInput(x.precio_unit)}" />
      </div>

      <div class="col-subt subt">Gs. ${money(subt)}</div>

      <div class="col-acc">
        <button class="del-btn" type="button">✕</button>
      </div>
    `;

    const [btnMenos, btnMas] = row.querySelectorAll(".cant-btn");
    const btnDel = row.querySelector(".del-btn");
    const inpPrecio = row.querySelector(".precio-input");

    btnMenos.onclick = () => restarItem(x.producto.id);
    btnMas.onclick = () => sumarItem(x.producto.id);
    btnDel.onclick = () => eliminarItem(x.producto.id);

   inpPrecio.addEventListener("input", () => {
  if (ventaBloqueada) return; // 🔒
  const n = parseGs(inpPrecio.value);
  x.precio_unit = n;
  spanTotal.textContent = money(totalVenta());
  row.querySelector(".subt").textContent = `Gs. ${money(n * x.cantidad)}`;
});


inpPrecio.addEventListener("blur", () => {
  if (ventaBloqueada) return; // 🔒
  inpPrecio.value = formatGsInput(parseGs(inpPrecio.value));
});


    ventaBody.appendChild(row);
  });

  spanTotal.textContent = money(totalVenta());
  cantItems.textContent = String(carrito.reduce((acc, x) => acc + x.cantidad, 0));
  cantProductos.textContent = String(carrito.length);
}

function aplicarClienteDesdeStorage() {
  const id = sessionStorage.getItem("venta_cliente_id");
  const nombre = sessionStorage.getItem("venta_cliente_nombre");

  if (id && nombre) {
    if (clienteCodigo) clienteCodigo.value = String(id);
    if (clienteNombre) clienteNombre.value = String(nombre);

    sessionStorage.removeItem("venta_cliente_id");
    sessionStorage.removeItem("venta_cliente_nombre");
    return true;
  }
  return false;
}


/* ================== CLIENTE (CODIGO SIMPLE: 1,2,3...) ================== */
function setClienteDefault() {
  if (clienteCodigo) clienteCodigo.value = "1";
  if (clienteNombre) {
    clienteNombre.value = "Consumidor final";
    clienteNombre.classList.remove("cliente-noexiste");
  }
}

function cleanNum(v) {
  return String(v || "").replace(/\D/g, "");
}

async function buscarClientePorId(idStr) {
  const id = Number(idStr);

  // 1 = consumidor final
  if (!idStr || id === 1) {
    if (clienteNombre) {
      clienteNombre.value = "Consumidor final";
      clienteNombre.classList.remove("cliente-noexiste");
    }
    return true;
  }

  if (!Number.isFinite(id) || id <= 0) return false;

  try {
    const res = await fetch(`${API}/api/clientes/${id}`);
    if (!res.ok) {
      if (clienteNombre) {
        clienteNombre.value = "Cliente no existe";
        clienteNombre.classList.add("cliente-noexiste");
      }
      toast(`Cliente ${id} no existe`);
      return false;
    }

    const c = await res.json();
    if (clienteNombre) {
      clienteNombre.value = c.nombre || "(Sin nombre)";
      clienteNombre.classList.remove("cliente-noexiste");
    }
    return true;
  } catch (e) {
    console.error("Error buscando cliente:", e);
    toast("Error al buscar cliente");
    return false;
  }
}

if (clienteCodigo) {
  // mientras escribe: solo números
  clienteCodigo.addEventListener("input", () => {
    clienteCodigo.value = cleanNum(clienteCodigo.value);

    if (clienteNombre) {
      clienteNombre.classList.remove("cliente-noexiste");
      if (clienteCodigo.value === "1") clienteNombre.value = "Consumidor final";
    }
  });

  // Enter: buscar en DB
  clienteCodigo.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    clienteCodigo.value = cleanNum(clienteCodigo.value);

    if (!clienteCodigo.value) {
      setClienteDefault();
      return;
    }

    const ok = await buscarClientePorId(clienteCodigo.value);
    if (!ok) setTimeout(() => setClienteDefault(), 700);
  });

  // blur: también intenta buscar
  clienteCodigo.addEventListener("blur", async () => {
    clienteCodigo.value = cleanNum(clienteCodigo.value);

    if (!clienteCodigo.value) {
      setClienteDefault();
      return;
    }

    const ok = await buscarClientePorId(clienteCodigo.value);
    if (!ok) setTimeout(() => setClienteDefault(), 700);
  });
}


function crearCliente() {
  // abrir módulo cliente para crear
  window.location.href = "cliente.html?mode=create&from=venta";
}

function abrirBuscadorCliente() {
  // abrir módulo cliente para buscar/seleccionar
  window.location.href = "cliente.html?mode=select&from=venta";
}





/* ================== ACCIONES ================== */
function vaciarVenta() {
  if (ventaBloqueada) { toast("Venta efectivizada. No se puede modificar."); return; }
  carrito = [];
  movActualId = null;
  renderVenta();
  setEstadoUI("ABIERTO");
}

function guardarAbierto() {
  if (ventaBloqueada) { toast("Venta efectivizada. No se puede modificar."); return; }
  const id = guardarMovimientoLocal("ABIERTO");
  if (id) {
    setEstadoUI("ABIERTO");
    toast(`Guardado como abierto (#${id}).`);
  }
}

function nuevaVenta() {

  setBloqueoVenta(false); // 

  if (carrito.length > 0) {
    const id = guardarMovimientoLocal("ABIERTO");
    if (id) toast(`Movimiento guardado (#${id}). Nueva venta lista.`);
  }

  carrito = [];
  movActualId = null;
  setClienteDefault();
  if (fechaVenta) fechaVenta.value = hoyISO();
  if (tipoVenta) tipoVenta.value = "CONTADO";
  if (formaPago) formaPago.value = "EFECTIVO";
  renderVenta();
  setEstadoUI("ABIERTO");
}

function cancelarVenta() {
  if (ventaBloqueada) { toast("Venta efectivizada. No se puede modificar."); return; }
  // Recupera el último BORRADOR de venta_movimientos (lo correcto)
  const list = getMovs();
  const abierto = list.find(m => (m.estado || "ABIERTO") === "ABIERTO");

  if (!abierto) {
    nuevaVenta();
    toast("No hay nota abierto para recuperar.");
    return;
  }

  cargarMovimientoLocal(abierto.id);
  toast(`Abierto recuperado (#${abierto.id}).`);
}

function imprimirVenta() {
  window.print();
}



/* ================== EFECTIVIZAR ================== */
async function efectivizarVenta() {
  if (carrito.length === 0) {
    toast("Carrito vacío. No hay nada para efectivizar.");
    return;
  }

  // Guardar el movimiento como EFECTIVADO en local (pero OJO: evitar doble efectivización)
  const list = getMovs();

  // Si ya existe un movimiento actual y ya está EFECTIVADO, no repetir
  if (movActualId) {
    const ya = list.find(m => m.id === movActualId);
    if (ya && (ya.estado === "EFECTIVADO")) {
      toast(`Este movimiento ya fue efectivizado (#${movActualId}).`);
      setEstadoUI("EFECTIVADO");
      return;
    }
  }

  // 1) Armar detalle desde carrito (lo mismo que buildMovPayload usa)
  const detalle = carrito.map(x => ({
    producto_id: x.producto.id,
    cantidad: Number(x.cantidad || 0)
  }));

  try {
    // 2) Descontar stock REAL en backend
    await descontarStockBackend(detalle);

    // 3) Marcar movimiento EFECTIVADO y guardar en storage
   const id = guardarMovimientoLocal("EFECTIVADO");
if (id) {
  setEstadoUI("EFECTIVADO");
  setBloqueoVenta(true); // 🔒 BLOQUEO TOTAL
  toast(`Venta efectivizada (#${id}). Stock actualizado.`);
}


    // 4) Refrescar productos desde backend para que el stock quede real en pantalla
    await cargarProductos();

  } catch (e) {
    console.error(e);
    toast(e.message || "No se pudo efectivizar (error).");
  }
}


/* ================== EXPORTS (para onclick HTML) ================== */
window.cargarProductos = cargarProductos;
window.vaciarVenta = vaciarVenta;
window.nuevaVenta = nuevaVenta;
window.cancelarVenta = cancelarVenta;
window.guardarAbierto = guardarAbierto;
window.imprimirVenta = imprimirVenta;
window.efectivizarVenta = efectivizarVenta;

window.abrirBuscadorCliente = abrirBuscadorCliente;
window.crearCliente = crearCliente;


//  ESTA ES LA CLAVE: tu HTML llama abrirBuscadorMvt()
window.abrirBuscadorMvt = abrirMovimientos;


/* ================== INIT ================== */
document.addEventListener("DOMContentLoaded", async () => {
  if (fechaVenta) fechaVenta.value = hoyISO();
  await cargarCategorias();
  await cargarProductos();

  const ok = aplicarClienteDesdeStorage();
  if (!ok) setClienteDefault();

  renderVenta();

  if (!movActualId) {
    setEstadoUI("ABIERTO");
    setBloqueoVenta(false);
  }

  // 🔁 Recibir movimiento seleccionado desde movimientos.html
  const movId = sessionStorage.getItem("mov_seleccionado");

  if (movId){
    cargarMovimientoLocal(movId);
    sessionStorage.removeItem("mov_seleccionado");
  }
});
