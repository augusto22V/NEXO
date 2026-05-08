const display = document.getElementById("display");

function presionar(valor){
  display.value += valor;
}

function limpiar(){
  display.value = "";
}

function volverSeguro(){
  if (document.referrer && document.referrer.includes(location.origin)) {
    window.history.back();
  } else {
    window.location.href = "/home.html";
  }
}

function calcular(){
  try{
    const resultado = eval(display.value);
    display.value = resultado;
  }catch{
    display.value = "";
    alert("Error en la operación");
  }
}