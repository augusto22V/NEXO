const Modelo = {

    productos: [
        "Conjunto Broderie",
        "Vestido Floral",
        "Outfit Verano"
    ],

    clientes: [
        "María González",
        "Sofía Rojas",
        "Ana Martínez",
        "Camila López",
        "Lucía Fernández"
    ],

    obtenerGanador() {
        const index = Math.floor(Math.random() * this.clientes.length);
        return this.clientes[index];
    }

};
