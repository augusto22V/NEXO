let carrito=[];
let compraId=null;

document.addEventListener("DOMContentLoaded",()=>{
  document.getElementById("fecha").value=new Date().toISOString().split("T")[0];
  document.getElementById("proveedor").focus();
});

/* ===== ENTER GLOBAL ===== */
document.addEventListener("keydown",(e)=>{
  if(e.key==="Enter"){
    e.preventDefault();
    manejarEnter(e.target);
  }
});

function manejarEnter(el){

  if(el.id==="proveedor"){
    buscarProveedor();
  }

  else if(el.id==="comprador"){
    document.getElementById("producto").focus();
  }

  else if(el.id==="producto"){
    document.getElementById("cantidad").focus();
  }

  else if(el.id==="cantidad"){
    document.getElementById("costo").focus();
  }

  else if(el.id==="costo"){
    agregarProducto();
  }
}

/* ===== AGREGAR PRODUCTO ===== */
function agregarProducto(){

  const nombre=document.getElementById("producto").value;
  const cantidad=Number(document.getElementById("cantidad").value);
  const costo=Number(document.getElementById("costo").value);

  if(!nombre || cantidad<=0 || costo<=0) return;

  carrito.push({nombre,cantidad,costo});

  document.getElementById("producto").value="";
  document.getElementById("cantidad").value="";
  document.getElementById("costo").value="";

  document.getElementById("producto").focus();

  render();
}

/* ===== RENDER ===== */
function render(){
  const body=document.getElementById("detalleBody");
  body.innerHTML="";

  carrito.forEach((item,i)=>{
    body.innerHTML+=`
      <tr>
        <td>${i+1}</td>
        <td>${item.nombre}</td>
        <td>${item.cantidad}</td>
        <td>${item.costo}</td>
        <td>${item.cantidad*item.costo}</td>
        <td><button onclick="eliminar(${i})">X</button></td>
      </tr>
    `;
  });

  actualizarTotal();
}

function eliminar(i){
  carrito.splice(i,1);
  render();
}

function actualizarTotal(){
  const total=carrito.reduce((a,b)=>a+(b.cantidad*b.costo),0);
  document.getElementById("totalCompra").textContent="Gs "+total;
}

/* ===== ACCIONES ===== */
function nuevaCompra(){
  carrito=[];
  render();
}

function guardarCompra(){
  alert("Compra guardada");
}

function efectivar(){
  alert("Efectivar cargar producto al Stock");
}