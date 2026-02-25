const API = "http://localhost:3000";

let carrito = [];
let total = 0;

/* ===============================
   CARGAR PRODUCTOS (CATÁLOGO)
================================ */
async function cargarProductos() {
    const texto = document.getElementById("buscador").value.toLowerCase();
    const categoriaId = document.getElementById("categoriaSelect").value;

    const res = await fetch(`${API}/productos`);
    let productos = await res.json();

    if (categoriaId) {
        productos = productos.filter(p => p.categoria_id == categoriaId);
    }

    if (texto) {
        productos = productos.filter(p =>
            p.nombre.toLowerCase().includes(texto)
        );
    }

    const cont = document.getElementById("productos");
    cont.innerHTML = "";

   productos.forEach(p => {
    cont.innerHTML += `
        <div class="producto">
            <img 
                src="${API}/uploads/productos/${p.imagen}" 
                alt="${p.nombre}"
                class="img-producto"
            >

            <h4>${p.nombre}</h4>
            <p>${p.descripcion || ""}</p>

            <p class="precio">
                Gs. ${Number(p.precio).toLocaleString()}
            </p>

            <button onclick="agregarAlCarrito(${p.id}, '${p.nombre}', ${p.precio})">
                Agregar
            </button>
        </div>
    `;
});

}

/* ===============================
   CARGAR CATEGORÍAS
================================ */
async function cargarCategorias() {
    const res = await fetch(`${API}/categorias`);
    const categorias = await res.json();

    const select = document.getElementById("categoriaSelect");
    select.innerHTML = `<option value="">Todas</option>`;

    categorias.forEach(c => {
        select.innerHTML += `
            <option value="${c.id}">${c.nombre}</option>
        `;
    });
}

/* ===============================
   CARRITO
================================ */
function agregarAlCarrito(id, nombre, precio) {
    const existente = carrito.find(i => i.producto_id === id);

    if (existente) {
        existente.cantidad++;
    } else {
        carrito.push({
            producto_id: id,
            nombre,
            precio,
            cantidad: 1
        });
    }

    total += Number(precio);
    actualizarCarrito();
}

function actualizarCarrito() {
    const ul = document.getElementById("carrito");
    ul.innerHTML = "";

    carrito.forEach(p => {
        const li = document.createElement("li");
        li.textContent = `${p.nombre} x${p.cantidad} - Gs. ${p.precio}`;
        ul.appendChild(li);
    });

    document.getElementById("total").innerText = total.toLocaleString();
}

/* ===============================
   FINALIZAR PEDIDO
================================ */
async function finalizarPedido() {
    if (carrito.length === 0) {
        alert("El carrito está vacío");
        return;
    }

    const clienteNombre =
        prompt("Nombre del cliente (opcional):") || "Consumidor Final";

    const res = await fetch(`${API}/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            clienteNombre,
            items: carrito,
            total
        })
    });

    const data = await res.json();

    if (res.ok) {
        alert(`Pedido guardado. Nº ${data.pedidoId}`);
        carrito = [];
        total = 0;
        actualizarCarrito();
    } else {
        alert("Error al guardar pedido");
    }
}

/* ===============================
   INIT
================================ */
document.addEventListener("DOMContentLoaded", () => {
    cargarCategorias();
    cargarProductos();
});


/* ===============================
   Carga de Producto
================================ */

document.getElementById("btnCargarProducto")?.addEventListener("click", () => {
  window.location.href = "productos.html";
});
