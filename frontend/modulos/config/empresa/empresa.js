const API = "/api/empresa"

let empresas = []
let empresaEditando = null
const msgBox = document.getElementById("msgBox")
const buscarEmpresa = document.getElementById("buscarEmpresa")

function mostrarMensaje(msg,tipo="ok"){
  msgBox.textContent = msg
  msgBox.className = "msg-box "+tipo
  msgBox.style.display="block"

  setTimeout(()=>{
    msgBox.style.display="none"
  },3000)
}

/* ============================
CARGAR EMPRESAS
============================ */
async function cargarEmpresas(){
  try{
    const res = await fetch(API)
    const data = await res.json()

    empresas = Array.isArray(data) ? data : []
    renderTabla()

  }catch(err){
    console.error(err)
    mostrarMensaje("Error cargando empresas","err")
  }
}

/* ============================
RENDER TABLA
============================ */
function renderTabla(){

  const filtro = buscarEmpresa.value?.toLowerCase() || ""
  const tbody = document.querySelector(".data-table tbody")

  tbody.innerHTML=""

  const filtradas = empresas.filter(e=>{
    return (
      (e.codigo||"").toLowerCase().includes(filtro) ||
      (e.nombre||"").toLowerCase().includes(filtro) ||
      (e.ruc||"").toLowerCase().includes(filtro)
    )
  })

  if(filtradas.length===0){
    tbody.innerHTML=`<tr>
    <td colspan="10" style="text-align:center;color:#777">
    No hay empresas registradas
    </td>
    </tr>`
    return
  }

  filtradas.forEach(e=>{

    const tr = document.createElement("tr")

    tr.innerHTML = `
    <td>${e.id}</td>
    <td>${e.codigo}</td>
    <td>${e.nombre}</td>
    <td>${e.ruc || ""}</td>
    <td>${e.direccion || ""}</td>
    <td>${e.telefono || ""}</td>
    <td>${e.email || ""}</td>
    <td>
    ${e.logo 
      ? `<img src="/recursos/img/${e.logo}?t=${Date.now()}" class="logo-tabla">`
      : `<span style="color:#888">Sin logo</span>`}
    </td>

    <td>
    <span class="badge ${e.activa ? "badge-ok":"badge-off"}">
    ${e.activa ? "ACTIVA":"INACTIVA"}
    </span>
    </td>

    <td>
    <button class="btn-editar" onclick="editar(${e.id})">
    <i class="fa-solid fa-pen"></i>
    </button>

    <button class="btn-eliminar" onclick="eliminarEmpresa(${e.id})">
    <i class="fa-solid fa-trash"></i>
    </button>
    </td>
    `

    tbody.appendChild(tr)
  })
}

/* ============================
ELIMINAR
============================ */
async function eliminarEmpresa(id){

  const confirmar = confirm("¿Eliminar esta empresa?")
  if(!confirmar) return

  try{
    const res = await fetch(API + "/" + id,{ method:"DELETE" })

    if(!res.ok){
      mostrarMensaje("No se pudo eliminar","err")
      return
    }

    mostrarMensaje("Empresa eliminada")
    cargarEmpresas()

  }catch(err){
    console.error(err)
    mostrarMensaje("Error eliminando empresa","err")
  }
}

function filtrarEmpresas(){
  renderTabla()
}

/* ============================
GUARDAR EMPRESA
============================ */
async function guardarEmpresa(){

  const codigo = document.getElementById("codigo").value
  const nombre = document.getElementById("nombre").value
  const ruc = document.getElementById("ruc").value
  const direccion = document.getElementById("direccion").value
  const telefono = document.getElementById("telefono").value
  const email = document.getElementById("email").value
  const logo = document.getElementById("logo").files[0]

  if(!codigo || !nombre){
    mostrarMensaje("Código y nombre son obligatorios","err")
    return
  }

  const formData = new FormData()

  formData.append("codigo",codigo)
  formData.append("nombre",nombre)
  formData.append("ruc",ruc)
  formData.append("direccion", direccion || "")
  formData.append("telefono",telefono || "")
  formData.append("email",email || "")
  if(logo){
    formData.append("logo",logo)
  }

  try{

    let url = API
    let method = "POST"

    if(empresaEditando){
      url = API + "/" + empresaEditando
      method = "PUT"
    }

    const res = await fetch(url,{
      method,
      body:formData
    })

    const data = await res.json()

    if(!res.ok){
      const detalle = data.detalle || data.detail || data.hint || ""
      const msg = data.error || "No se pudo guardar"
      console.error("[GUARDAR EMPRESA] backend:", data)
      mostrarMensaje(detalle ? `${msg}: ${detalle}` : msg, "err")
      return
    }

    mostrarMensaje(
      empresaEditando 
      ? "Empresa actualizada correctamente" 
      : "Empresa guardada correctamente"
    )

    if (data?.id) {
      document.getElementById("empresaIdActual").value = data.id
    }

    empresaEditando = null

    limpiar()
    cargarEmpresas()

  }catch(err){
    console.error(err)
    mostrarMensaje("Error de conexión","err")
  }
}

/* ============================
EDITAR
============================ */
function editar(id){

  // Comparacion no estricta: la API puede devolver id como string o number
  const emp = empresas.find(e => Number(e.id) === Number(id))
  if(!emp) {
    console.error("[EDITAR EMPRESA] no se encontro id:", id, "empresas:", empresas)
    mostrarMensaje(`No se encontró la empresa #${id}`, "err")
    return
  }
  console.log("[EDITAR EMPRESA] cargando:", emp)

  empresaEditando = emp.id
  document.getElementById("empresaIdActual").value = emp.id

  document.getElementById("codigo").value = emp.codigo
  document.getElementById("nombre").value = emp.nombre
  document.getElementById("ruc").value = emp.ruc || ""
  document.getElementById("direccion").value = emp.direccion || ""
  document.getElementById("telefono").value = emp.telefono || ""
  document.getElementById("email").value = emp.email || ""

  // Limpiamos el input de archivo (sino el navegador conserva el del último upload)
  const logoInput = document.getElementById("logo")
  if (logoInput) logoInput.value = ""

  // Indicador visual: cambia el título de la sección y el texto del botón
  const titulo = document.querySelector(".empresa-form-title, .form-title, h2, h3")
  if (titulo && !titulo.dataset.originalText) {
    titulo.dataset.originalText = titulo.textContent
  }
  if (titulo) titulo.textContent = `Editando: ${emp.nombre}`

  const btnGuardar = document.querySelector('button[onclick="guardarEmpresa()"]')
  if (btnGuardar) btnGuardar.textContent = "Actualizar empresa"

  mostrarMensaje(`Editando empresa: ${emp.nombre}`, "ok")

  window.scrollTo({top:0,behavior:"smooth"})
}

/* ============================
LIMPIAR
============================ */
function limpiar(){

  document.getElementById("codigo").value=""
  document.getElementById("nombre").value=""
  document.getElementById("ruc").value=""
  document.getElementById("direccion").value=""
  document.getElementById("telefono").value=""
  document.getElementById("email").value=""
  const logoInput = document.getElementById("logo")
  if (logoInput) logoInput.value = ""

  empresaEditando = null
  document.getElementById("empresaIdActual").value = ""

  // Restaurar título y botón a estado "nuevo"
  const titulo = document.querySelector(".empresa-form-title, .form-title, h2, h3")
  if (titulo && titulo.dataset.originalText) {
    titulo.textContent = titulo.dataset.originalText
  }
  const btnGuardar = document.querySelector('button[onclick="guardarEmpresa()"]')
  if (btnGuardar) btnGuardar.innerHTML = '<i class="fa-solid fa-save"></i> Guardar empresa'

  obtenerCodigo()
}

function volver(){
  window.location.href="/home.html"
}

function salirSistema(){
  window.location.href="/login/login.html"
}

/* ============================
INICIAR
============================ */
async function obtenerCodigo(){
  try{
    const res = await fetch(API + "/siguiente-codigo")
    const data = await res.json()

    document.getElementById("codigo").value = data.codigo

  }catch(err){
    console.error(err)
  }
}

cargarEmpresas()
