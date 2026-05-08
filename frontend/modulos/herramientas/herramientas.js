const API = window.location.origin + "/api";
const sesion = JSON.parse(localStorage.getItem("usuario") || "{}");

const EMPRESA_ID = sesion.empresa_id || null;
const TERMINAL_ID = sesion.terminal_id || null;

let impresoras = {};


function toast(mensaje, tipo = "info") {
  const colores = { success: "#2e7d32", error: "#c62828", warning: "#f57f17", info: "#1565c0" };
  const iconos  = { success: "✔", error: "✖", warning: "⚠", info: "ℹ" };
  const t = document.createElement("div");
  t.className = "toast-item";
  t.style.background = colores[tipo] || colores.info;
  t.innerHTML = `<span>${iconos[tipo]}</span><span>${mensaje}</span>`;
  document.getElementById("toastContainer").appendChild(t);
  requestAnimationFrame(() => t.classList.add("toast-visible"));
  setTimeout(() => { t.classList.remove("toast-visible"); t.addEventListener("transitionend", () => t.remove()); }, 3000);
}

function setEstado(id, mensaje, ok) {
  const el = document.getElementById(id);
  el.textContent = mensaje;
  el.className = "estado-msg " + (ok ? "estado-ok" : "estado-error");
}

/* ===== CARGAR CONFIG ===== */
async function cargarConfig() {
  try {
   const res = await fetch(`${API}/config/impresoras`, {
  credentials: "include"
});

    
  const cfg = await res.json();

impresoras = cfg;

// 🔥 NORMALIZAR ANTES DE RENDER
Object.keys(impresoras).forEach(k => {
  if (impresoras[k].tipo) {
    impresoras[k].tipo = impresoras[k].tipo.toLowerCase();
  }
});

renderImpresoras();

document.getElementById("ventaNombre").value = cfg.venta?.nombre || "";

  } catch {
    toast("Error al cargar configuración", "error");
  }
}


function renderImpresoras() {

  const cont = document.getElementById("listaImpresoras");
  cont.innerHTML = "";

Object.keys(impresoras).forEach(key => {

  if (["venta", "empresa_id", "terminal_id"].includes(key)) return;

  const imp = impresoras[key];

  //  ignorar si no es objeto válido
  if (typeof imp !== "object") return;

    cont.innerHTML += `
      <div class="panel" style="margin-top:10px">

        <h3>${key.toUpperCase()}</h3>

        <div class="form-row">
          <label>Tipo</label>
          <select onchange="impresoras['${key}'].tipo=this.value.toLowerCase()">
            <option value="red" ${imp.tipo === "red" ? "selected" : ""}>Red</option>
            <option value="usb" ${imp.tipo === "usb" ? "selected" : ""}>USB</option>
          </select>
        </div>

        <div class="form-row">
          <input placeholder="Nombre (USB)"
            value="${imp.nombre || ""}"
             oninput="impresoras['${key}'].nombre=this.value">
        </div>

        <div class="form-row">
          <input placeholder="IP (Red)"
            value="${imp.ip || ""}"
           oninput="impresoras['${key}'].ip=this.value">
        </div>

        <div class="form-row">
          <input type="number" placeholder="Puerto"
            value="${imp.puerto || 9100}"
            oninput="impresoras['${key}'].puerto=this.value">
        </div>

        <div class="config-acciones">
          <button onclick="probarDestino('${key}')">🖨 Probar</button>
          <button onclick="eliminarDestino('${key}')">🗑 Eliminar</button>
        </div>

      </div>
    `;
  });

}

function agregarImpresora() {

  const nombre = prompt("Nombre del destino (ej: cocina, barra)");

  if (!nombre) return;

  const key = nombre.toLowerCase().trim();

  if (impresoras[key]) {
    toast("Ese destino ya existe", "warning");
    return;
  }

  impresoras[key] = {
    tipo: "red",
    nombre: "",
    ip: "",
    puerto: 9100
  };

  renderImpresoras();
}


/* ===== GUARDAR CONFIG ===== */
async function guardarConfig() {

  const config = {
    ...impresoras,
    venta: {
      tipo: "usb",
      nombre: document.getElementById("ventaNombre").value.trim()
    }
  };

  try {

    await fetch(`${API}/config/impresoras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(config)
    });

    toast("Configuración guardada ✔", "success");

    window.dispatchEvent(new Event("impresorasActualizadas"));

  } catch {
    toast("Error al guardar configuración", "error");
  }
}



/* ===== PROBAR Impresora ===== */
async function probarDestino(destino) {

  const imp = impresoras[destino];


  if (imp.tipo === "usb") {

    if (!imp.nombre) {
      toast("Falta nombre de impresora USB", "warning");
      return;
    }

    await fetch(`${API}/print/prueba-usb`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: imp.nombre })
    });

    toast(`Prueba enviada a ${destino} (USB)`, "success");

  } else {

    if (!imp.ip) {
      toast("Falta IP", "warning");
      return;
    }

    const res = await fetch(`${API}/print/prueba-red`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // 🔥 ESTE
  body: JSON.stringify({
    ip: imp.ip,
    puerto: imp.puerto
  })
});

    if (res.ok) {
      toast(`Prueba enviada a ${destino}`, "success");
    } else {
      toast(`Error en ${destino}`, "error");
    }

  }

}


/* ===== PROBAR USB ===== */
async function probarUSB() {
  const nombre = document.getElementById("ventaNombre").value.trim();
  if (!nombre) { toast("Ingresá el nombre de la impresora", "warning"); return; }

  toast("Imprimiendo prueba...", "info");

  try {
    const res = await fetch(`${API}/print/prueba-usb`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // 🔥 ESTE
  body: JSON.stringify({ nombre })
});

    const data = await res.json();
    if (res.ok) {
      setEstado("estadoUSB", `✔ Impresión enviada — ${nombre}`, true);
      toast("Prueba enviada USB ✔", "success");
    } else {
      setEstado("estadoUSB", "✖ No se pudo conectar a la impresora USB", false);
      toast("No se pudo conectar a la impresora USB", "error");
    }
  } catch {
    setEstado("estadoUSB", "✖ Error de conexión", false);
    toast("Error de conexión", "error");
  }
}

function eliminarDestino(nombre) {

  if (!confirm(`¿Eliminar destino ${nombre}?`)) return;

  delete impresoras[nombre];

  renderImpresoras();

  toast("Destino eliminado", "warning");
}

async function reiniciarPedidos(){

  if(!confirm("⚠ Esto reiniciará la numeración de pedidos.\nEl próximo pedido será el número 1.\n\n¿Desea continuar?")){
    return;
  }

  try{

    const r = await fetch("/api/venta/reiniciar-numeracion",{
      method:"POST"
    });

    const data = await r.json();

    if(data.ok){
      document.getElementById("estadoPedidos").innerText =
        "✔ Numeración reiniciada correctamente";
    }else{
      document.getElementById("estadoPedidos").innerText =
        "❌ No se pudo reiniciar";
    }

  }catch(err){

    document.getElementById("estadoPedidos").innerText =
      "❌ Error de conexión";

  }

}

async function guardarConfigPedidos(){

  const config = {
    autoReset: document.getElementById("autoResetPedidos").checked,
    horaReset: document.getElementById("horaResetPedidos").value
  };

  try{

    const r = await fetch("/api/config/pedidos",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(config)
    });

    const data = await r.json();

    if(data.ok){
      document.getElementById("configuracionIdActual").value = "1";
      setEstado("estadoPedidos","✔ Configuración guardada",true);
    }else{
      setEstado("estadoPedidos","❌ No se pudo guardar",false);
    }

  }catch(err){

    setEstado("estadoPedidos","❌ Error de conexión",false);

  }

}

async function cargarConfigPedidos(){

  try{

    const r = await fetch("/api/config/pedidos");
    const data = await r.json();

    document.getElementById("autoResetPedidos").checked =
      data.auto_reset_pedidos || false;

    document.getElementById("horaResetPedidos").value =
      data.hora_reset_pedidos || "00:00";
    document.getElementById("configuracionIdActual").value = "1";

  }catch(err){

    console.error(err);

  }

}

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", () => {
  cargarConfig();
  cargarConfigPedidos();
});

window.agregarImpresora = agregarImpresora;
window.probarDestino = probarDestino;
window.eliminarDestino = eliminarDestino;
window.guardarConfig = guardarConfig;
