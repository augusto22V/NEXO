const display = document.getElementById("display");
const indicador = document.getElementById("indicador-teclado");
let expresion = "";
let resultado_mostrado = false;

// Foco automatico al cargar
window.addEventListener("load", () => { display.focus(); });

// Al hacer click en cualquier parte de la calculadora, recupera el foco
document.addEventListener("click", () => { display.focus(); });

// Indicador visual de teclado activo/inactivo
window.addEventListener("focus", () => {
  indicador.textContent = "⌨ teclado activo";
  indicador.className = "teclado-indicador activo";
});
window.addEventListener("blur", () => {
  indicador.textContent = "⌨ click aqui";
  indicador.className = "teclado-indicador inactivo";
});

function presionar(valor) {
  const ultimo = expresion.slice(-1);
  const esOperador = "+-*/".includes(valor);
  const esOperadorUltimo = "+-*/".includes(ultimo);

  // Si se muestra resultado y presionan numero, empieza expresion nueva
  if (resultado_mostrado && !esOperador) {
    expresion = "";
    resultado_mostrado = false;
  }
  // Si se muestra resultado y presionan operador, continua desde el resultado
  if (resultado_mostrado && esOperador) {
    resultado_mostrado = false;
  }

  // No permitir * o / al inicio
  if (expresion === "" && (valor === "*" || valor === "/")) return;

  // Operador doble: reemplazar el ultimo operador (excepto - para negativos)
  if (esOperador && esOperadorUltimo) {
    if (valor === "-") {
      expresion += valor;
      display.value = expresion;
      return;
    }
    expresion = expresion.slice(0, -1) + valor;
    display.value = expresion;
    return;
  }

  // No permitir punto doble en el mismo numero
  if (valor === ".") {
    const partes = expresion.split(/[+\-*/]/);
    const ultimaParte = partes[partes.length - 1];
    if (ultimaParte.includes(".")) return;
    if (ultimaParte === "") {
      expresion += "0";
    }
  }

  expresion += valor;
  display.value = expresion;
}

function borrar() {
  expresion = expresion.slice(0, -1);
  display.value = expresion || "";
  resultado_mostrado = false;
}

function limpiar() {
  expresion = "";
  display.value = "";
  resultado_mostrado = false;
}

function calcular() {
  if (!expresion || expresion === "") return;

  // Quitar operador al final si lo hay
  let expr = expresion.replace(/[+\-*/]$/, "");
  if (!expr) return;

  try {
    // Verificar division por cero
    if (/\/\s*0(?!\d)/.test(expr)) {
      display.value = "Error: div/0";
      expresion = "";
      resultado_mostrado = false;
      return;
    }

    // Usar Function en lugar de eval (mas seguro)
    const resultado = Function('"use strict"; return (' + expr + ')')();

    if (!isFinite(resultado) || isNaN(resultado)) {
      display.value = "Error: div/0";
      expresion = "";
      resultado_mostrado = false;
      return;
    }

    // Redondear para evitar errores de punto flotante (ej: 0.1+0.2)
    const redondeado = parseFloat(resultado.toFixed(10));
    expresion = String(redondeado);
    display.value = expresion;
    resultado_mostrado = true;

  } catch {
    display.value = "Error";
    expresion = "";
    resultado_mostrado = false;
  }
}

// Soporte de teclado
document.addEventListener("keydown", function(e) {
  if ("0123456789".includes(e.key)) {
    presionar(e.key);
  } else if ("+-*/".includes(e.key)) {
    presionar(e.key);
  } else if (e.key === ".") {
    presionar(".");
  } else if (e.key === "Enter" || e.key === "=") {
    calcular();
  } else if (e.key === "Backspace") {
    borrar();
  } else if (e.key === "Escape" || e.key === "Delete") {
    limpiar();
  }
});

function volverSeguro() {
  if (document.referrer && document.referrer.includes(location.origin)) {
    window.history.back();
  } else {
    window.location.href = "/home.html";
  }
}
