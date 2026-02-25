const API = "/api/productos-precio";

/* ================= ELEMENTOS ================= */
const nombreProducto = document.getElementById("nombreProducto");
const descripcionProducto = document.getElementById("descripcionProducto");

const precioCompra = document.getElementById("precioCompra");
const costoTransporte = document.getElementById("costoTransporte");
const productoIdInput = document.getElementById("producto_id");

const filas = document.querySelectorAll(".tabla tbody tr");
const filaVenta = filas[0];
const filaMin = filas[1];
const filaPromo = filas[2];

/* ================= FORMATO ================= */
function formatearGs(valor) {
  if (valor === "" || valor === null || isNaN(valor)) return "";
  return Number(valor).toLocaleString("es-PY");
}

function limpiarNumero(valor) {
  if (!valor) return 0;
  return Number(valor.toString().replace(/\./g, "").replace(",", "."));
}

/* ================= UTIL ================= */
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function costoReal() {
  return limpiarNumero(precioCompra.value) + limpiarNumero(costoTransporte.value);
}

function calcularMargen(precio) {
  const costo = costoReal();
  if (costo <= 0) return 0;
  return ((precio - costo) / costo) * 100;
}

/* ================= CARGAR PRODUCTO ================= */
async function cargarProducto(id) {
  const res = await fetch(`/api/productos/${id}`);
  const p = await res.json();

  nombreProducto.textContent = p.nombre;
  descripcionProducto.textContent = p.descripcion || "";
  productoIdInput.value = p.id;
}

/* ================= CARGAR PRECIO ================= */
async function cargarPrecio(id) {
  const res = await fetch(`/api/productos-precio/producto/${id}`);
  const precio = await res.json();
  if (!precio) return;

  precioCompra.value = formatearGs(precio.precio_compra);
  costoTransporte.value = formatearGs(precio.costo_transporte);

  filaVenta.querySelector(".precio").value = formatearGs(precio.precio_venta);
  filaMin.querySelector(".precio").value = formatearGs(precio.precio_minimo || "");
  filaPromo.querySelector(".precio").value = formatearGs(precio.precio_promocional || "");

  filas.forEach(fila => {
    const p = limpiarNumero(fila.querySelector(".precio").value);
    if (p > 0) {
      fila.querySelector(".margen").value = calcularMargen(p).toFixed(2);
    }
  });
}

/* ================= CALCULO MARGEN  PRECIO ================= */
filas.forEach(fila => {
  const margenInput = fila.querySelector(".margen");
  const precioInput = fila.querySelector(".precio");

  // %  Precio
  margenInput.addEventListener("input", () => {
    const porcentaje = Number(margenInput.value.replace(",", "."));
    if (isNaN(porcentaje)) return;

    const venta = costoReal() + (costoReal() * porcentaje / 100);
    precioInput.value = formatearGs(Math.round(venta));
  });

  // Precio → %
  precioInput.addEventListener("input", () => {
    const limpio = limpiarNumero(precioInput.value);
    if (limpio <= 0) return;

    margenInput.value = calcularMargen(limpio).toFixed(2);
  });

  // Formato final + validación
  precioInput.addEventListener("blur", () => {
    const limpio = limpiarNumero(precioInput.value);
    precioInput.value = formatearGs(limpio);

    if (limpio < costoReal()) {
      precioInput.style.color = "red";
    } else {
      precioInput.style.color = "";
    }
  });
});

/* ================= COPIAR MARGEN (VENTA → MIN / PROMO) ================= */
filaVenta.querySelector(".margen").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;

  const valor = e.target.value;

  filaMin.querySelector(".margen").value = valor;
  filaPromo.querySelector(".margen").value = valor;

  filaMin.querySelector(".margen").dispatchEvent(new Event("input"));
  filaPromo.querySelector(".margen").dispatchEvent(new Event("input"));
});

/* ================= REACCION A CAMBIO DE COSTO ================= */
[precioCompra, costoTransporte].forEach(el => {
  el.addEventListener("input", () => {
    filas.forEach(fila => {
      const margen = fila.querySelector(".margen");
      const precio = fila.querySelector(".precio");

      if (margen.value) {
        const porcentaje = Number(margen.value.replace(",", "."));
        if (isNaN(porcentaje)) return;

        const venta = costoReal() + (costoReal() * porcentaje / 100);
        precio.value = formatearGs(Math.round(venta));
      }
    });
  });

  el.addEventListener("blur", () => {
    el.value = formatearGs(limpiarNumero(el.value));
  });
});

/* ================= GUARDAR ================= */
document.getElementById("formPrecio").addEventListener("submit", async e => {
  e.preventDefault();

  // obtener valores actuales
  const venta = limpiarNumero(filaVenta.querySelector(".precio").value);
  const minimo = limpiarNumero(filaMin.querySelector(".precio").value);
  const promo = limpiarNumero(filaPromo.querySelector(".precio").value);

  // construir objeto dinamico
  const body = {
    producto_id: productoIdInput.value,
    precio_compra: limpiarNumero(precioCompra.value),
    costo_transporte: limpiarNumero(costoTransporte.value),
    precio_venta: venta
  };

  // SOLO agregar si existe
  if (minimo > 0) body.precio_minimo = minimo;
  if (promo > 0) body.precio_promocional = promo;

  await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  volver();
});

/* ================= ENTER COMO TAB ================= */
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;

  const inputs = Array.from(document.querySelectorAll("input:not([type=hidden])"));
  const index = inputs.indexOf(document.activeElement);
  if (index === -1) return;

  e.preventDefault();

  if (index === inputs.length - 1) {
    document.getElementById("formPrecio").requestSubmit();
  } else {
    inputs[index + 1].focus();
    inputs[index + 1].select?.();
  }
});

/* ================= NAVEGACION ================= */
function volver() {
  window.location.href = "../productos/productos.html";
}

function abrirSelector() {
  location.href = "../productos/selector-producto.html?volver=precio";
}

/* ================= SOLO NUMEROS ================= */

function soloNumerosInput(input) {

  let ultimoValor = "";

  input.addEventListener("input", () => {

    let limpio = input.value.replace(/[^\d]/g, "");

    // si queda vacio pero antes habia valor → mantener
    if (limpio === "" && ultimoValor !== "") {
      input.value = ultimoValor;
      return;
    }

    // guardar valor
    ultimoValor = limpio;

    // formatear
    input.value = limpio ? Number(limpio).toLocaleString("es-PY") : "";

  });

}

// aplicar a todos los campos monetarios
soloNumerosInput(precioCompra);
soloNumerosInput(costoTransporte);

filas.forEach(fila => {
  soloNumerosInput(fila.querySelector(".precio"));
});


function bloquearTeclasInvalidas(input) {

  input.addEventListener("keydown", e => {

    if (
      !/[0-9]/.test(e.key) &&
      !["Backspace","Delete","ArrowLeft","ArrowRight","Tab"].includes(e.key)
    ) {
      e.preventDefault();
    }

  });

}

// aplicar
bloquearTeclasInvalidas(precioCompra);
bloquearTeclasInvalidas(costoTransporte);

filas.forEach(fila => {
  bloquearTeclasInvalidas(fila.querySelector(".precio"));
});


/* ================= ATAJOS TECLADO ================= */

document.addEventListener("keydown", (e) => {

  // 🔙 ESC → Volver
  if (e.key === "Escape") {
    e.preventDefault();
    volver();
  }

  // 💾 F3 → Guardar
  if (e.key === "F3") {
    e.preventDefault();
    document.getElementById("formPrecio").requestSubmit();
  }

});
/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", () => {
  const id = getParam("producto");
  if (!id) return;

  cargarProducto(id);
  cargarPrecio(id);
});
