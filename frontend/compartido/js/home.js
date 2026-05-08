 // 🔥 VIBRACIÓN GLOBAL
document.addEventListener("click", (e) => {

  const btn = e.target.closest("button, .card-producto, .card-categoria");

  if (!btn) return;

  // ❌ evitar vibrar en eliminar
  if (btn.classList.contains("btn-eliminar")) return;

  if ("vibrate" in navigator) {
    navigator.vibrate(10);
  }

});