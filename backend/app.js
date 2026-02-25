const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

/* Configuracion base */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* Rutas API */

app.use('/api/clientes', require('./routes/clientes.routes'));
app.use('/api/productos', require('./routes/productos.routes'));
app.use('/api/categorias', require('./routes/categorias.routes'));
app.use('/api/ventas', require('./routes/ventas.routes'));
app.use('/api/compra', require('./routes/compra.routes'));
app.use('/api/sorteo', require('./routes/sorteo.routes'));
app.use('/api/proveedores', require('./routes/proveedores.routes'));
app.use('/api/productos-precio', require('./routes/productosPrecio.routes'));

/* Archivos subidos */

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* Servir frontend */

app.use(express.static(path.join(__dirname, '../frontend')));

/* Puerto servidor */



const PORT = 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ejecutandose en puerto ${PORT}`);
});