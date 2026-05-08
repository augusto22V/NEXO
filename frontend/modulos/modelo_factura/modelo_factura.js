const API = "/api/modelo_factura";

// ===== CARGAR DATOS =====
async function cargar() {

  try {

    const res = await fetch(API);
    const data = await res.json();

    if (!data) return;
    document.getElementById("modeloFacturaId").value = data.id || "";

    document.getElementById("descripcion").value = data.descripcion || "";
    document.getElementById("establecimiento").value = data.punto_establecimiento || "";
    document.getElementById("expedicion").value = data.punto_expedicion || "";
    document.getElementById("timbrado").value = data.timbrado || "";
    document.getElementById("inicio").value = data.fecha_inicio?.split("T")[0] || "";
    document.getElementById("fin").value = data.fecha_vencimiento?.split("T")[0] || "";
    document.getElementById("actividad").value = data.actividad || "";
    document.getElementById("moneda").value = data.moneda || "PYG";

    document.getElementById("ticket").checked = data.ticket_fiscal || false;
    document.getElementById("auto").checked = data.numeracion_automatica || false;

  } catch (err) {
    console.error("Error cargando modelo factura", err);
  }
}

// ===== GUARDAR =====
async function guardar() {

  const payload = {
    descripcion: document.getElementById("descripcion").value,
    punto_establecimiento: document.getElementById("establecimiento").value,
    punto_expedicion: document.getElementById("expedicion").value,
    timbrado: document.getElementById("timbrado").value,
    fecha_inicio: document.getElementById("inicio").value,
    fecha_vencimiento: document.getElementById("fin").value,
    actividad: document.getElementById("actividad").value,
    moneda: document.getElementById("moneda").value,
    ticket_fiscal: document.getElementById("ticket").checked,
    numeracion_automatica: document.getElementById("auto").checked
  };

  try {

    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error();

    const data = await res.json();
    document.getElementById("modeloFacturaId").value = data.id || document.getElementById("modeloFacturaId").value;

    alert("Guardado correctamente");

  } catch (err) {

    console.error(err);
    alert("Error al guardar");

  }
}

// ===== VOLVER =====
function volverSeguro(){
  window.location.href = "../../home.html";
}

// ===== INIT =====
window.onload = () => {
  cargar();
};
