/* =========================================================
   ALPX — Exportación de tablas (listados)
   ---------------------------------------------------------
   Helper reutilizable para exportar cualquier listado a:
   - Excel (.xls compatible vía tabla HTML — Excel lo abre nativo)
   - PDF   (vía diálogo de impresión del sistema → "Guardar como PDF")

   Uso:
     SoftSysExport.exportarExcel("listado_productos", "Listado de productos",
       [
         { label: "Código",  campo: "codigo" },
         { label: "Nombre",  campo: "nombre" },
         { label: "Stock",   valor: (f) => Number(f.stock||0).toLocaleString("es-PY") }
       ],
       arregloDeFilas
     );
     SoftSysExport.exportarPDF();   // imprime la página actual (Guardar como PDF)
   ========================================================= */
(function () {
  function escaparHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function valorCelda(col, fila) {
    if (typeof col.valor === "function") return col.valor(fila);
    return fila[col.campo];
  }

  function construirHtmlTabla(titulo, columnas, filas) {
    const ths = columnas
      .map((c) => `<th style="background:#1F4E78;color:#fff;border:1px solid #ccc;padding:6px;text-align:left">${escaparHtml(c.label)}</th>`)
      .join("");

    const trs = filas
      .map((f) => "<tr>" + columnas
        .map((c) => `<td style="border:1px solid #ddd;padding:6px">${escaparHtml(valorCelda(c, f))}</td>`)
        .join("") + "</tr>")
      .join("");

    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8"></head>
<body>
  <h3>${escaparHtml(titulo)}</h3>
  <table border="1" cellspacing="0">
    <thead><tr>${ths}</tr></thead>
    <tbody>${trs}</tbody>
  </table>
</body></html>`;
  }

  // Convierte texto UTF-8 a base64 sin romper acentos/emoji
  function utf8ABase64(texto) {
    return btoa(unescape(encodeURIComponent(texto)));
  }

  function descargarArchivo(nombre, contenidoTexto, mime) {
    // En Electron: usar el diálogo nativo "Guardar como"
    if (window.__electronAPI && typeof window.__electronAPI.saveFile === "function") {
      const base64 = utf8ABase64(contenidoTexto);
      window.__electronAPI.saveFile(nombre, base64).catch(() => {});
      return;
    }
    // Navegador normal
    const blob = new Blob([contenidoTexto], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportarExcel(nombreBase, titulo, columnas, filas) {
    if (!Array.isArray(filas) || !filas.length) {
      alert("No hay datos para exportar.");
      return;
    }
    const html = construirHtmlTabla(titulo, columnas, filas);
    descargarArchivo(`${nombreBase}.xls`, html, "application/vnd.ms-excel");
  }

  // Convierte columnas+filas al formato que espera el backend (headers[] + rows[][])
  function aHeadersRows(columnas, filas) {
    const headers = columnas.map((c) => c.label);
    const rows = filas.map((f) => columnas.map((c) => String(valorCelda(c, f) ?? "")));
    return { headers, rows };
  }

  // Genera un PDF REAL en el backend y lo descarga (no usa el diálogo de impresión).
  async function exportarPDF(nombreBase, titulo, columnas, filas) {
    if (!Array.isArray(filas) || !filas.length) {
      alert("No hay datos para exportar.");
      return;
    }
    try {
      const { headers, rows } = aHeadersRows(columnas, filas);
      const res = await fetch("/api/reportes/exportar-tabla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ formato: "pdf", titulo, nombre: nombreBase, headers, rows })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo generar el PDF");
      }

      const fileName = `${nombreBase}.pdf`;
      const arrayBuffer = await res.arrayBuffer();

      // En Electron: diálogo nativo "Guardar como" (base64 por chunks, sin overflow)
      if (window.__electronAPI && typeof window.__electronAPI.saveFile === "function") {
        const bytes = new Uint8Array(arrayBuffer);
        let bin = "";
        const CHUNK = 8192;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        await window.__electronAPI.saveFile(fileName, btoa(bin));
        return;
      }

      // Navegador normal
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Error al generar PDF: " + (e.message || e));
    }
  }

  window.SoftSysExport = { exportarExcel, exportarPDF };
})();
