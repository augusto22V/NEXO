
const API = "/api/sorteo";
/* ==========================
   CONFIGURACIÓN
========================== */
let totalSorteos = 3; // se toma del select al iniciar

/* ==========================
   CANVAS
========================== */
const canvas = document.getElementById("ruleta");
const ctx = canvas.getContext("2d");

canvas.width = 500;
canvas.height = 500;

const cx = canvas.width / 2;
const cy = canvas.height / 2;
const radio = 250;

/* ==========================
   ESTADO GLOBAL
========================== */
let etapa = 1;          // etapa REAL del sorteo (1..totalSorteos, final = totalSorteos+1)
let vistaEtapa = 1;     // etapa que el usuario está mirando
let todos = [];         // participantes (de backend)
let grupos = [];        // array de arrays: grupos[0] => sorteo1
let participantes = []; // grupo actual mostrado en ruleta/lista
let finalistas = [];    // ganadores de cada sorteo previo (para final)
let ganadores = [];     // ganadores por sorteo [0..totalSorteos-1], y final aparte
let ganadorFinal = null;

let ganadorPendiente = null;
let anguloActual = 0;
let girando = false;

/* 🎨 Paleta */
const colores = [
  "#E4F4EA",
  "#D1EAD9",
  "#BFE0C8",
  "#A8D5B5",

  "#E5EDF5",
  "#D3E2F0",
  "#C0D7EB",
  "#AECBE6",

  "#F1F1F1",
  "#E6E6E6",
  "#DBDBDB",
  "#D0D0D0",

  "#E8F1EE",
  "#D6E5E0",
  "#C4DAD3",
  "#B2CFC6"
];

/* ==========================
   INIT
========================== */
window.addEventListener("load", async () => {
  // tomar valor del select
  const sel = document.getElementById("cantidadSorteos");
  totalSorteos = Number(sel.value);

  crearEtapasVisuales();
  crearResumenGanadores();

  await cargarParticipantes();
});

/* ==========================
   APLICAR CANTIDAD DE SORTEOS
========================== */
async function aplicarCantidadSorteos() {
  const sel = document.getElementById("cantidadSorteos");
  totalSorteos = Number(sel.value);

  // Reiniciar la estructura, pero no borra backend
  etapa = 1;
  vistaEtapa = 1;
  finalistas = [];
  ganadores = [];
  ganadorFinal = null;
  ganadorPendiente = null;

  crearEtapasVisuales();
  crearResumenGanadores();

  dividirEnGrupos();
  usarGrupoActual();
}

/* ==========================
   CREAR ETAPAS DINÁMICAS
========================== */
function crearEtapasVisuales() {
  const cont = document.getElementById("etapas");
  cont.innerHTML = "";

  for (let i = 1; i <= totalSorteos; i++) {
    const s = document.createElement("span");
    s.id = `etapa-${i}`;
    s.className = "etapa";
    s.textContent = `Sorteo ${i}`;
    s.onclick = () => verEtapa(i);
    cont.appendChild(s);

    if (i < totalSorteos || totalSorteos > 1) {
      const flecha = document.createElement("span");
      flecha.className = "flecha";
      flecha.textContent = "→";
      cont.appendChild(flecha);
    }
  }

  //  SOLO crear FINAL si hay más de 1 sorteo
  if (totalSorteos > 1) {
    const f = document.createElement("span");
    f.id = `etapa-${totalSorteos + 1}`;
    f.className = "etapa";
    f.textContent = "Final";
    f.onclick = () => verEtapa(totalSorteos + 1);
    cont.appendChild(f);
  }

  marcarEtapaActiva(vistaEtapa);
}

/* ==========================
   RESUMEN GANADORES DINÁMICO
========================== */
function crearResumenGanadores() {
  const cont = document.getElementById("resumenSorteos");
  cont.innerHTML = `<h3>Ganadores</h3>`;

  // grilla como tu estilo (2 columnas)
  const grid = document.createElement("div");
  grid.className = "resumen-grid";

  for (let i = 1; i <= totalSorteos; i++) {
    const row = document.createElement("div");
    row.innerHTML = `<strong>Sorteo ${i}:</strong> <span id="res-${i}">—</span>`;
    grid.appendChild(row);
  }

  const rowFinal = document.createElement("div");
  rowFinal.className = "final";
  rowFinal.innerHTML = `<strong>Final:</strong> <span id="res-final">—</span>`;
  grid.appendChild(rowFinal);

  cont.appendChild(grid);
}

/* ==========================
   CARGAR PARTICIPANTES (BACKEND)
========================== */
async function cargarParticipantes() {
  const res = await fetch("http://localhost:3000/sorteo/participantes");
  todos = await res.json();

  dividirEnGrupos();
  usarGrupoActual();
}

/* ==========================
   AGREGAR PARTICIPANTE
========================== */
async function agregarParticipante() {
  if (vistaEtapa !== 1) {
    alert("Solo se pueden agregar participantes en Sorteo 1");
    return;
  }

  const input = document.getElementById("nombreParticipante");
  const nombre = input.value.trim();
  if (!nombre) return;

  // (Opcional) evitar duplicados si no se permite
  const permitirDuplicados = document.getElementById("permitirDuplicados")?.checked;
  if (!permitirDuplicados) {
    const existe = todos.some(p => p.nombre?.toLowerCase() === nombre.toLowerCase());
    if (existe) {
      document.getElementById("modalDuplicado").classList.remove("hidden");
      return;
    }
  }

  await fetch("http://localhost:3000/sorteo/participantes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre })
  });

  input.value = "";
  await cargarParticipantes();
}

function handleEnter(e){
  if(e.key === "Enter") agregarParticipante();
}

/* ==========================
   DIVIDIR EN N GRUPOS
========================== */
function dividirEnGrupos() {
  // crear grupos vacíos
  grupos = Array.from({ length: totalSorteos }, () => []);

  // repartir participantes uno por uno
  todos.forEach((p, index) => {
    const grupoIndex = index % totalSorteos;
    grupos[grupoIndex].push(p);
  });
}


/* ==========================
   USAR GRUPO SEGÚN VISTA/ETAPA
========================== */
function usarGrupoActual() {
  const input = document.getElementById("nombreParticipante");
  input.disabled = etapa !== 1;

  if (vistaEtapa <= totalSorteos) {
    participantes = grupos[vistaEtapa - 1] || [];
  } else {
    participantes = finalistas;
  }

  anguloActual = 0;
  renderLista();
  dibujarRuleta();
  marcarEtapaActiva(vistaEtapa);

  actualizarTotales(); // 👈 ESTO
}



function actualizarTotales() {
  const totalGeneral = todos.length;
  const totalActual = participantes.length;

  const totalEl = document.getElementById("totalActual");
  const textoEl = document.getElementById("textoTotal");

  if (!totalEl) return;

  totalEl.textContent = `${totalActual} de ${totalGeneral}`;

  if (vistaEtapa <= totalSorteos) {
    textoEl.textContent = "participantes en este sorteo";
  } else {
    textoEl.textContent = "finalistas";
  }
}

/* ==========================
   ETAPA ACTIVA (color)
========================== */
function marcarEtapaActiva(n) {
  document.querySelectorAll(".etapa").forEach(e => e.classList.remove("activa"));
  const el = document.getElementById(`etapa-${n}`);
  if (el) el.classList.add("activa");
}

/* ==========================
   VER ETAPA (clic)
========================== */
function verEtapa(n) {
  vistaEtapa = n;
  usarGrupoActual();
}

/* ==========================
   LISTA LATERAL
========================== */
function renderLista() {
  const ul = document.getElementById("listaParticipantes");
  ul.innerHTML = "";

  participantes.forEach((p, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="numero">${i + 1}.</span>
      <span class="nombre">${p.nombre}</span>
      <button class="btn-eliminar" onclick="eliminarParticipanteGlobal(${p.id})">🗑️</button>
    `;
    ul.appendChild(li);
  });
}



async function eliminarParticipanteGlobal(id) {
  // 1️⃣ Confirmación (recomendado)
  const ok = confirm(
    "¿Seguro que deseas eliminar este participante?\n" +
    "Se eliminará de todos los sorteos y ganadores."
  );
  if (!ok) return;

  // 2️⃣ Eliminar del backend
  await fetch(`http://localhost:3000/sorteo/participantes/${id}`, {
    method: "DELETE"
  });

  // 3️⃣ Eliminar de la lista global
  todos = todos.filter(p => p.id !== id);

  // 4️⃣ Eliminar de todos los grupos
  grupos = grupos.map(grupo =>
    grupo.filter(p => p.id !== id)
  );

  // 5️⃣ Eliminar de finalistas
  finalistas = finalistas.filter(p => p.id !== id);

  // 6️⃣ Limpiar ganadores si corresponde
  ganadores = ganadores.map(g =>
    g && g.id === id ? null : g
  );

  if (ganadorFinal && ganadorFinal.id === id) {
    ganadorFinal = null;
    document.getElementById("res-final").textContent = "—";
  }

  // 7️⃣ Recalcular grupos por cantidad de sorteos
  dividirEnGrupos();

  // 8️⃣ Refrescar vista actual
  usarGrupoActual();
}


/* ==========================
   DIBUJAR RULETA
========================== */
function dibujarRuleta() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (participantes.length === 0) return;

  const ang = (2 * Math.PI) / participantes.length;

  participantes.forEach((p, i) => {
    const inicio = i * ang;
    const fin = inicio + ang;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radio, inicio, fin);
    ctx.fillStyle = colores[i % colores.length];
    ctx.fill();
    ctx.strokeStyle = "#222";
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(inicio + ang / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.font = "16px Segoe UI";
    ctx.fillText(p.nombre, radio - 15, 0);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();
}

/* ==========================
   GIRAR
========================== */
function girar() {
  if (girando || participantes.length < 2) return;

  // si están mirando una etapa distinta a la etapa real, no girar
  if (vistaEtapa !== etapa) {
    alert("Para girar, primero seleccioná la etapa actual.");
    return;
  }

  // final solo si hay finalistas suficientes
  if (etapa === totalSorteos + 1 && finalistas.length < 2) {
    alert("Necesitás al menos 2 finalistas para el Final.");
    return;
  }

  girando = true;

  let velocidad = Math.random() * 0.3 + 0.4;
  const friccion = 0.985;

  function animar() {
    anguloActual += velocidad;
    velocidad *= friccion;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(cx, cy);
    ctx.rotate(anguloActual);
    ctx.translate(-cx, -cy);
    dibujarRuleta();
    ctx.restore();

    if (velocidad > 0.002) {
      requestAnimationFrame(animar);
    } else {
      girando = false;
      calcularGanador();
    }
  }
  animar();
}

/* ==========================
   CALCULAR GANADOR
========================== */
function calcularGanador() {
  const total = participantes.length;
  if (total === 0) return;

    if (totalSorteos === 1) {
    const ganador = participantes[Math.floor(Math.random() * participantes.length)];

    document.getElementById("res-1").textContent = ganador.nombre;
    document.getElementById("res-final").textContent = ganador.nombre;

    mostrarModal("🏆 GANADOR FINAL 🏆", ganador.nombre);
    return;
  }


  const ang = (2 * Math.PI) / total;

  let anguloReal = ((3 * Math.PI) / 2 - anguloActual) % (2 * Math.PI);
  if (anguloReal < 0) anguloReal += 2 * Math.PI;

  const index = Math.floor(anguloReal / ang);
  const ganador = participantes[index];
  if (!ganador) return;

  // sorteos 1..N
  if (etapa <= totalSorteos) {
    ganadorPendiente = ganador;

    // guardo en ganadores
    ganadores[etapa - 1] = ganador;

    // sumar a finalistas
    finalistas.push(ganador);

    // pintar resumen
    document.getElementById(`res-${etapa}`).textContent = ganador.nombre;

    mostrarModal(`🎁 Ganador Sorteo ${etapa}`, ganador.nombre);
    return;
  }

  // FINAL
  ganadorFinal = ganador;
  document.getElementById("res-final").textContent = ganador.nombre;
  mostrarModal("🏆 GANADOR FINAL 🏆", ganador.nombre);
}

/* ==========================
   MODAL
========================== */
function mostrarModal(titulo, nombre) {
  document.getElementById("tituloModal").textContent = titulo;
  document.getElementById("nombreGanador").textContent = nombre;
  document.getElementById("modalGanador").classList.remove("hidden");
}

function cerrarModal() {
  document.getElementById("modalGanador").classList.add("hidden");

  // avanzar de etapa real recién al cerrar modal
  if (ganadorPendiente && etapa <= totalSorteos) {
    ganadorPendiente = null;
    etapa++;
    vistaEtapa = etapa;

    // si terminó el último sorteo, pasar a final (etapa = totalSorteos + 1)
    if (etapa === totalSorteos + 1) {
      // vista final se arma con finalistas
    }

    usarGrupoActual();
  }
}


/* ==========================
   ELIMINAR PARTICIPANTE (solo vista 1)
========================== */
async function eliminarParticipante(id) {
  await fetch(`http://localhost:3000/sorteo/participantes/${id}`, {
    method: "DELETE"
  });
  await cargarParticipantes();
}

/* ==========================
   NUEVO SORTEO
========================== */
function nuevoSorteo() {
  document.getElementById("modalConfirmar").classList.remove("hidden");
}

function cerrarConfirmacion() {
  document.getElementById("modalConfirmar").classList.add("hidden");
}

async function confirmarNuevoSorteo() {
  // 1️⃣ borrar backend
  await fetch("http://localhost:3000/sorteo/participantes", {
    method: "DELETE"
  });

  // 2️⃣ resetear estado frontend
  etapa = 1;
  vistaEtapa = 1;

  todos = [];
  grupos = [];
  participantes = [];
  finalistas = [];
  ganadores = [];
  ganadorFinal = null;
  ganadorPendiente = null;

  anguloActual = 0;
  girando = false;

  // 3️⃣ cerrar modal
  document.getElementById("modalConfirmar").classList.add("hidden");

  // 4️⃣ reconstruir UI base
  crearEtapasVisuales();
  crearResumenGanadores();

  // 5️⃣  VOLVER A SINCRONIZAR CON BACKEND
  await cargarParticipantes();   // ← ESTE ERA EL FALTANTE CLAVE

  // 6️⃣ asegurar contadores y vista
  usarGrupoActual();
  actualizarTotales();

  // 7️⃣ reactivar controles
  document.getElementById("btnGirar").disabled = false;
  document.getElementById("nombreParticipante").disabled = false;
}


let clientesSistema = [];

async function abrirModalClientes() {
  const res = await fetch("http://localhost:3000/api/clientes");
  clientesSistema = await res.json();

  renderClientesModal(clientesSistema);
  document.getElementById("modalClientes").classList.remove("hidden");
}
function renderClientesModal(data) {
  const cont = document.getElementById("listaClientesModal");
  cont.innerHTML = "";

  data.forEach(c => {
    const row = document.createElement("div");
    row.className = "cliente-row";
    row.innerHTML = `
      <input 
        type="checkbox"
        value="${c.id}"
        data-nombre="${c.nombre}"
      >

      <span class="col-id">${c.id}</span>
      <span class="col-nombre">${c.nombre}</span>
      <span class="col-correo">${c.correo ?? "Sin correo"}</span>
    `;
    cont.appendChild(row);
  });
}



function filtrarClientesModal() {
  const t = document.getElementById("buscarCliente").value.toLowerCase();
  renderClientesModal(
    clientesSistema.filter(c =>
      c.nombre.toLowerCase().includes(t)
    )
  );
}
function seleccionarTodosClientes(check) {
  document
    .querySelectorAll("#listaClientesModal input[type=checkbox]")
    .forEach(cb => cb.checked = check.checked);
}
async function agregarClientesSeleccionados() {
  const checks = document.querySelectorAll(
    "#listaClientesModal input[type=checkbox]:checked"
  );

  if (checks.length === 0) {
    alert("Seleccioná al menos un cliente");
    return;
  }

  for (const cb of checks) {
    const nombre = cb.dataset.nombre; //  ESTE ES EL FIX

    // evitar duplicados
    if (todos.some(p => p.nombre === nombre)) continue;

    await fetch("http://localhost:3000/sorteo/participantes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre })
    });
  }

  cerrarModalClientes();
  await cargarParticipantes();
}

function cerrarModalClientes() {
  document.getElementById("modalClientes").classList.add("hidden");
}


window.addEventListener("beforeunload", function (e) {
  if (hayCambiosSinGuardar()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ==========================
   DUPLICADO
========================== */
function cerrarDuplicado() {
  document.getElementById("modalDuplicado").classList.add("hidden");
}
