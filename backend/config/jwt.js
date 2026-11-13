// Clave para firmar los tokens de sesion.
// En la nube se define con la variable de entorno JWT_SECRET; en la PC local sigue usando la de siempre.
module.exports = process.env.JWT_SECRET || "stoptop_secret_2024";
