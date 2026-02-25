const API = "/api/productos";

/* ===== ELEMENTOS ===== */
const form = document.getElementById("formProducto");
const lista = document.getElementById("listaProductos");
const buscador = document.getElementById("buscadorProductos");

const codigoInput = document.getElementById("codigoProducto");
const nombreInput = document.getElementById("nombreProducto");
const descripcionInput = document.getElementById("descripcionProducto");
const ivaInput = document.getElementById("ivaProducto");

const categoriaSelect = document.getElementById("categoriaSelect");
const categoriaIdInput = document.getElementById("categoriaIdInput");
const precioVentaInput = document.getElementById("precioVenta");

const imagenInput = document.getElementById("imagenProducto");
const previewImagen = document.getElementById("previewImagen");
const previewPlaceholder = document.getElementById("previewPlaceholder");

const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");

let productoSeleccionado = null;
let categoriasMap = {};

window.productoSeleccionado = null;
/* ===== UTIL ===== */
function formatoGs(valor) {
  if (!valor) return "";
  return Number(valor).toLocaleString("es-PY");
}

/* ===== ESTADO INICIAL ===== */
function estadoInicial() {

  form.reset();
  productoSeleccionado = null;

  previewImagen.style.display = "none";
  previewPlaceholder.style.display = "block";

  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;

  nombreInput.disabled = true;
  descripcionInput.disabled = true;
  ivaInput.disabled = true;
  categoriaSelect.disabled = true;
  categoriaIdInput.disabled = true;
  precioVentaInput.disabled = true;
  imagenInput.disabled = true;

  codigoInput.disabled = false;
  codigoInput.value = "";
 codigoInput.placeholder = "Ingrese código o Enter";

  setTimeout(() => {
    codigoInput.focus();
  }, 80);
}


/* ===== LISTAR ===== */
async function cargarProductos() {

  try {

    const res = await fetch(API);
    const data = await res.json();

    lista.innerHTML = "";

    if (!data.length) {
      lista.innerHTML = "<div style='padding:10px;color:#999'>Sin productos</div>";
      return;
    }

    const texto = buscador.value.toLowerCase();

    const filtrado = texto
      ? data.filter(p => p.nombre.toLowerCase().includes(texto))
      : data;

    //  CONSULTAR TODOS LOS PRECIOS EN PARALELO
    const precios = await Promise.all(
      filtrado.map(async (p) => {
        try {
          const precioRes = await fetch(`/api/productos-precio/producto/${p.id}`);
          const precioData = await precioRes.json();
          return {
            id: p.id,
            precioVenta: precioData?.precio_venta || 0
          };
        } catch {
          return { id: p.id, precioVenta: 0 };
        }
      })
    );

    //  MAPA DE PRECIOS
    const preciosMap = {};
    precios.forEach(pr => {
      preciosMap[pr.id] = pr.precioVenta;
    });

    //  RENDER
    const fragment = document.createDocumentFragment();

    for (const p of filtrado) {

      const row = document.createElement("div");
      row.className = "tabla-row";
      row.dataset.id = p.id; //  IMPORTANTE

      row.innerHTML = `
        <span>${p.id ?? ""}</span>
        <span>${p.nombre ?? ""}</span>
        <span>Gs. ${formatoGs(Number(p.precio_compra || 0) + Number(p.costo_transporte || 0))}</span>
        <span>Gs. ${formatoGs(preciosMap[p.id] || 0)}</span>
        <span>${p.stock ?? 0}</span>
        <span>${categoriasMap[String(p.categoria_id)] ?? "-"}</span>
      `;

      row.onclick = () => seleccionarProducto(p.id);

      fragment.appendChild(row);
    }

    lista.appendChild(fragment);

  } catch (err) {
    console.error("Error cargando productos", err);
    lista.innerHTML = "<div style='padding:10px;color:red'>Error cargando productos</div>";
  }
}


/* ===== SELECCIONAR ===== */
async function seleccionarProducto(id) {

  const res = await fetch(`${API}/${id}`);
  const p = await res.json();

productoSeleccionado = id;
window.productoSeleccionado = id;
imagenInput.value = "";
  codigoInput.value = p.id;
  nombreInput.value = p.nombre;
  descripcionInput.value = p.descripcion || "";
  ivaInput.value = p.iva_tipo;
imagenInput.disabled = false;
imagenInput.style.pointerEvents = "auto";
imagenInput.style.opacity = "1";

previewImagen.src = "";
previewImagen.style.display = "none";
previewPlaceholder.style.display = "block";

categoriaIdInput.disabled = false;
categoriaIdInput.style.pointerEvents = "auto";
categoriaIdInput.style.opacity = "1";

 setTimeout(() => {
  categoriaSelect.value = String(p.categoria_id);
}, 50);

categoriaIdInput.value = p.categoria_id;
try {
 const precioRes = await fetch(`/api/productos-precio/producto/${id}`);
  const precioData = await precioRes.json();

  precioVentaInput.value = precioData
    ? formatoGs(precioData.precio_venta)
    : "";
} catch {
  precioVentaInput.value = "";
}

  //  
if (p.imagen) {
  previewImagen.src = p.imagen;
  previewImagen.style.display = "block";
  previewPlaceholder.style.display = "none";
} 

  btnGuardar.disabled = false;
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;

  //  DESBLOQUEAR CAMPOS
nombreInput.disabled = false;
descripcionInput.disabled = false;
ivaInput.disabled = false;

categoriaSelect.disabled = false;
categoriaIdInput.disabled = false;
precioVentaInput.disabled = false;
imagenInput.disabled = false;

nombreInput.focus();

scrollAProducto(id);
}

function habilitarCampos() {

  nombreInput.disabled = false;
  descripcionInput.disabled = false;
  ivaInput.disabled = false;
  categoriaSelect.disabled = false;
  categoriaIdInput.disabled = false;
  precioVentaInput.disabled = false;
  imagenInput.disabled = false;

  btnGuardar.disabled = false;

}

/* ===== BUSCAR POR CODIGO ===== */
codigoInput.addEventListener("keydown", async (e) => {

  if (e.key !== "Enter") return;

  e.preventDefault();

  const valor = codigoInput.value.trim();

  // ===== ENTER VACIO → TRAER PROXIMO =====
  if (!valor) {

    try {

      const res = await fetch(API);
      const data = await res.json();

      const nextId = data.length
        ? Math.max(...data.map(p => p.id)) + 1
        : 1;

      codigoInput.value = nextId;

      // habilitar campos
      habilitarCampos();
      nombreInput.focus();

    } catch {
      alert("Error obteniendo código");
    }

    return;
  }

  // ===== BUSCAR SI EXISTE =====
  const id = parseInt(valor);

  try {

    const res = await fetch(`${API}/${id}`);

    if (res.ok) {
      seleccionarProducto(id);
      return;
    }

    // no existe → nuevo
    productoSeleccionado = null;
    habilitarCampos();
    nombreInput.focus();

  } catch {
    alert("Error consultando servidor");
  }

});


buscador.addEventListener("input", () => {
  cargarProductos();
});

function irAPrecio() {

  if (!productoSeleccionado) {
    alert("Seleccione un producto primero");
    return;
  }

  window.location.href = `../precio/precio.html?producto=${productoSeleccionado}`;

}

/* ===== GUARDAR ===== */
form.addEventListener("submit", async (e) => {

  e.preventDefault();

const data = new FormData(form);

//  evitar que stock se resetee
data.delete("stock");

  // limpiar precio
  let precioLimpio = precioVentaInput.value.replace(/[^\d]/g, "");
  data.set("precio_venta", precioLimpio);

  //  IMPORTANTE → enviar id en edición
  if (productoSeleccionado) {
    data.set("id", productoSeleccionado);
  }

  const url = productoSeleccionado
    ? `${API}/${productoSeleccionado}`
    : `${API}`;

  const method = productoSeleccionado ? "PUT" : "POST";

  const resGuardar = await fetch(url, { method, body: data });

  if (!resGuardar.ok) {
    alert("Error guardando producto");
    return;
  }

  const productoGuardado = await resGuardar.json();

  if (!productoSeleccionado) {
    productoSeleccionado = productoGuardado.id;
  }

  //  ACTUALIZAR PRECIO
  if (precioVentaInput.value) {

    const resPrecio = await fetch(`/api/productos-precio/producto/${productoSeleccionado}`);
    const precioActual = await resPrecio.json();

    await fetch(`/api/productos-precio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        producto_id: productoSeleccionado,
        precio_compra: precioActual?.precio_compra || 0,
        costo_transporte: precioActual?.costo_transporte || 0,
        precio_venta: Number(precioLimpio),
        precio_minimo: precioActual?.precio_minimo || null,
        precio_promocional: precioActual?.precio_promocional || null
      })
    });

  }

  await cargarProductos();
  estadoInicial();

});




/* ===== CANCELAR ===== */
function cancelarProducto() {
  estadoInicial();
  cargarProductos();
}

/* ===== ELIMINAR ===== */
async function eliminarProducto() {

  const idEliminar = Number(productoSeleccionado);

  if (!idEliminar) {
    console.log("No hay producto seleccionado");
    return;
  }

  baseModalOpenConfirm({
    titulo: "Eliminar producto",
    mensaje: "¿Desea eliminar el producto?",
    detalle: `#${idEliminar}`,
    onConfirm: async () => {

      try {

        console.log("DELETE:", idEliminar);

        const res = await fetch(`${API}/${idEliminar}`, {
          method: "DELETE"
        });

        if (!res.ok) {
          throw new Error("Error eliminando producto");
        }

        productoSeleccionado = null;
        window.productoSeleccionado = null;

        estadoInicial();
        await cargarProductos();

        baseModalOpenInfo({
          titulo: "Eliminado",
          mensaje: "Producto eliminado correctamente"
        });

      } catch (err) {

        console.error("ERROR DELETE:", err);

        baseModalOpenInfo({
          titulo: "Error",
          mensaje: "No se pudo eliminar el producto"
        });

      }

    }
  });

}

/* ===== ESC VOLVER ===== */
document.addEventListener("keydown", (e) => {

  const modalAdv = document.getElementById("modalAdvertencia");
  const modalElim = document.getElementById("modalEliminar");

  // ===== SI MODAL ADVERTENCIA ABIERTO =====
  if (!modalAdv.classList.contains("hidden")) {

    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      cerrarAdvertencia();
    }

    return;
  }

  // ===== SI MODAL ELIMINAR ABIERTO =====
  if (!modalElim.classList.contains("hidden")) {

    if (e.key === "Enter") {
      e.preventDefault();
      modalElim.querySelector(".btn-eliminar").click();
    }

    if (e.key === "Escape") {
      e.preventDefault();
      cerrarModalEliminar();
    }

    return;
  }

  // ===== ATAJOS NORMALES =====
  switch (e.key) {

    case "Escape":
      e.preventDefault();
      volver();
      break;

    case "F2":
      e.preventDefault();
      nuevoProducto();
      break;

    case "F3":
      e.preventDefault();
      if (!btnGuardar.disabled) btnGuardar.click();
      break;

    case "Delete":
      e.preventDefault();
      if (!btnEliminar.disabled) eliminarProducto();
      break;

    case "F4":
      e.preventDefault();
      if (!btnCancelar.disabled) cancelarProducto();
      break;

    case "Enter":
      if (e.ctrlKey) {
        e.preventDefault();
        if (!btnGuardar.disabled) btnGuardar.click();
      }
      break;

  }

});

/* ===== IMAGEN ===== */
imagenInput.addEventListener("change", () => {
  const file = imagenInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    previewImagen.src = e.target.result;
    previewImagen.style.display = "block";
    previewPlaceholder.style.display = "none";
  };
  reader.readAsDataURL(file);
});

/* ===== CATEGORIAS ===== */
async function cargarCategorias() {
  try {

    const res = await fetch(`/api/categorias`);
    const data = await res.json();

    categoriaSelect.innerHTML = `<option value="">Seleccione categoría</option>`;
    categoriasMap = {};

    data.forEach(c => {
      categoriaSelect.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
      categoriasMap[String(c.id)] = c.nombre;
    });

  } catch (err) {
    console.error("Error cargando categorias", err);
  }
}

form.addEventListener("keydown", function(e) {


  if (!document.getElementById("modalAdvertencia").classList.contains("hidden")) return;

  if (e.key !== "Enter") return;

  const activo = document.activeElement;

  //   permitir salto de línea en descripción con Shift+Enter
  if (activo === descripcionInput && e.shiftKey) return;

  //  evitar que Enter en botón haga cosas raras
  if (activo === btnGuardar) return;

  // ===== VALIDAR CATEGORIA =====
  if (activo === categoriaIdInput) {

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const id = String(categoriaIdInput.value).trim();

  if (!id) {
    categoriaSelect.value = "";
    categoriaSelect.focus();
    return;
  }

  if (!categoriasMap[id]) {

   baseModalOpenInfo({
  titulo: "Categoría",
  mensaje: "Categoría no encontrada",
  onClose: () => {
    categoriaIdInput.value = "";
    categoriaSelect.value = "";
    categoriaIdInput.focus();
    categoriaIdInput.select();
  }
});

    setTimeout(() => {
      categoriaIdInput.focus();
      categoriaIdInput.select();
    }, 120);

    return;
  }

  categoriaSelect.value = id;
  categoriaSelect.focus();
  return;
}

  // ===== NAVEGACION NORMAL =====
  e.preventDefault();

  const campos = [
    nombreInput,
    descripcionInput,
    precioVentaInput,
    ivaInput,
    categoriaIdInput,
    categoriaSelect,
    imagenInput
  ];

  const index = campos.indexOf(activo);

  if (index === -1) {
    nombreInput.focus();
    return;
  }

  // último campo → guardar
  if (index === campos.length - 1) {

    if (!btnGuardar.disabled) btnGuardar.click();
    return;
  }

  campos[index + 1].focus();

});

categoriaSelect.addEventListener("change", function() {
  
  categoriaIdInput.value = categoriaSelect.value;
});
 
categoriaIdInput.addEventListener("blur", function() {

  const id = String(categoriaIdInput.value).trim();

  if (!id) {
    categoriaSelect.value = "";
    return;
  }

  if (!categoriasMap[id]) {

   baseModalOpenInfo({
  titulo: "Categoría",
  mensaje: "Categoría no encontrada",
  onClose: () => {
    categoriaIdInput.value = "";
    categoriaSelect.value = "";
    categoriaIdInput.focus();
    categoriaIdInput.select();
  }
});

    setTimeout(() => {
      categoriaIdInput.focus();
      categoriaIdInput.select();
    }, 120);

    return;
  }

  categoriaSelect.value = id;

});

function nuevoProducto() {

  estadoInicial();

  codigoInput.value = "";
  codigoInput.placeholder = "";

  productoSeleccionado = null;
  window.productoSeleccionado = null;

  nombreInput.disabled = false;
  descripcionInput.disabled = false;
  ivaInput.disabled = false;

  categoriaSelect.disabled = false;
  categoriaIdInput.disabled = false;

  precioVentaInput.disabled = false;
  precioVentaInput.value = "";

  imagenInput.disabled = false;

  btnGuardar.disabled = false;
  btnEliminar.disabled = true;
  btnCancelar.disabled = false;

  previewImagen.style.display = "none";
  previewPlaceholder.style.display = "block";

  nombreInput.focus();
}

precioVentaInput.addEventListener("blur", () => {
  let valor = precioVentaInput.value.replace(/[^\d]/g, "");
  precioVentaInput.value = valor ? Number(valor).toLocaleString("es-PY") : "";
});

//SIRVE PARA COLOCAR SCROOL EN LA TABLS OK.
function scrollAProducto(id) {

  const fila = document.querySelector(`.tabla-row[data-id="${id}"]`);
  if (!fila) return;

  fila.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

}

function soloNumeros(e) {
  if (!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) {
    e.preventDefault();
  }
}

codigoInput.addEventListener("keydown", soloNumeros);
precioVentaInput.addEventListener("keydown", soloNumeros);

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", async () => {

  await cargarCategorias();
  await cargarProductos();

  estadoInicial();

  requestAnimationFrame(() => {
    setTimeout(() => {
      codigoInput.focus();
      codigoInput.select();
    }, 120);
  });

});