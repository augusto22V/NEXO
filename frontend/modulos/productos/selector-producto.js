const API = "http://localhost:3000";

const lista = document.getElementById("listaProductos");
const buscador = document.getElementById("buscadorProductos");

/* ================= UTIL ================= */
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/* ================= CARGAR PRODUCTOS ================= */
async function cargarProductos(filtro = "") {
  const res = await fetch(`${API}/productos`);
  const productos = await res.json();

  lista.innerHTML = "";

  productos
    .filter(p =>
      p.nombre.toLowerCase().includes(filtro.toLowerCase())
    )
    .forEach(p => {
      const card = document.createElement("div");
      card.className = "producto-card";
      card.onclick = () => seleccionarProducto(p.id);

      card.innerHTML = `
        <img src="${p.imagen ? API + '/uploads/productos/' + p.imagen : 'img/no-image.png'}">
        <div class="info">
          <strong>${p.nombre}</strong>
          <p class="precio">Gs. ${p.precio_venta || 0}</p>
          <small>Stock: ${p.stock ?? '-'}</small>
        </div>
      `;

      lista.appendChild(card);
    });
}

/* ================= BUSCAR ================= */
buscador.addEventListener("input", () => {
  cargarProductos(buscador.value);
});

/* ================= SELECCIONAR ================= */
function seleccionarProducto(id) {

  const volver = getParam("volver");

  if (volver === "precio") {
    location.href = `../precio/precio.html?producto=${id}`;
  }
  else if (volver === "venta") {
    location.href = `../venta/venta.html?producto=${id}`;
  }
  else {
    location.href = `productos.html?producto=${id}`;
  }
}

/* ================= VOLVER ================= */
function volver() {
  history.back();
}

/* ================= INIT ================= */
cargarProductos();
