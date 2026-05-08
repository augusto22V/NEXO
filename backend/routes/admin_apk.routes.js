const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const APK_DIR = path.resolve(__dirname, "../../mobile/Aplicacion");
const APK_FILES = Object.freeze({
  "SoftSys.apk": "SoftSys.apk",
  "SoftSysCasa.apk": "SoftSysCasa.apk"
});

router.get("/:fileName", (req, res) => {
  const requestedName = String(req.params.fileName || "").trim();
  const safeName = APK_FILES[requestedName];

  if (!safeName) {
    return res.status(404).json({ error: "APK no encontrado" });
  }

  const filePath = path.join(APK_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Archivo APK no disponible" });
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  return res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) {
      res.status(error.statusCode || 500).json({ error: "No se pudo descargar el APK" });
    }
  });
});

module.exports = router;
