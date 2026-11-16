// Punto de arranque: en la nube con CATALOGO_SOLO=true corre solo el catalogo publico;
// en la PC corre el sistema completo como siempre.
require("dotenv").config();

if (String(process.env.CATALOGO_SOLO || "").toLowerCase() === "true") {
  require("./catalogo_solo");
} else {
  require("./app");
}
