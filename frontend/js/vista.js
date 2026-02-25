const API = 'http://localhost:3000/api';

async function cargarCategorias() {
    const res = await fetch(`${API}/productos/categorias`);
    const categorias = await res.json();

    const select = document.getElementById('categoriaSelect');
    select.innerHTML = '<option value="">Todas</option>';

    categorias.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nombre;
        select.appendChild(opt);
    });
}

async function cargarProductos() {
    const texto = document.getElementById('buscador').value.toLowerCase();
    const categoriaId = document.getElementById('categoriaSelect').value;

    const res = await fetch('http://localhost:3000/productos');
    let productos = await res.json();

    if (categoriaId) {
        productos = productos.filter(p => p.categoria_id == categoriaId);
    }

    if (texto) {
        productos = productos.filter(p =>
            p.nombre.toLowerCase().includes(texto)
        );
    }

    const cont = document.getElementById('productos');
    cont.innerHTML = '';

    productos.forEach(p => {
        cont.innerHTML += `
           <div class="producto">
    <div class="img">
        ${
            p.imagen
                ? `<img src="http://localhost:3000/uploads/productos/${p.imagen}" alt="${p.nombre}">`
                : ``
        }
    </div>


                <h4>${p.nombre}</h4>
                <small>${p.descripcion || ''}</small>

                <p class="precio">Gs. ${Number(p.precio).toLocaleString()}</p>

                <button onclick="agregarAlCarrito(${p.id}, '${p.nombre}', ${p.precio})">
                    Agregar
                </button>
            </div>
        `;
    });
}



window.onload = () => {
    cargarCategorias();
    cargarProductos();
};
