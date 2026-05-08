const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../Auth.middleware");

router.use(authMiddleware);

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      `
        SELECT id, nombre, simbolo
        FROM moneda
        ORDER BY id
      `
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar monedas" });
  }
});

module.exports = router;
