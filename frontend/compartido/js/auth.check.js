/* =============================================
   AUTH CHECK GLOBAL
   ============================================= */
(function () {
  const usuarioStr = localStorage.getItem("usuario");

  function irLogin() {
    if (window.SoftSysSession?.purgeClientSession) {
      window.SoftSysSession.purgeClientSession({ preserveSafe: true });
    } else {
      localStorage.removeItem("usuario");
      localStorage.setItem("licenciaVencida", "1");
    }
    window.location.href = "/login/login.html";
  }

  if (!usuarioStr) {
    irLogin();
    return;
  }

  try {
    window.sesion = JSON.parse(usuarioStr);
  } catch {
    irLogin();
    return;
  }

  function normalizarRol(rol) {
    if (window.SoftSysProgramas?.normalizarRol) {
      return window.SoftSysProgramas.normalizarRol(rol);
    }
    return String(rol || "").trim().toUpperCase();
  }

  window.tieneRol = function (...roles) {
    const actual = normalizarRol(window.sesion?.rol);
    return roles.map((r) => normalizarRol(r)).includes(actual);
  };

  window.cerrarSesion = function () {
    if (window.SoftSysSession?.logout) {
      window.SoftSysSession.logout({ redirect: true, reason: "manual" });
      return;
    }

    fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" })
      .finally(irLogin);
  };

  fetch("/api/auth/verify", {
    credentials: "include",
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" }
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.usuario) {
        throw new Error("session_invalid");
      }

      if (data?.licencia?.vencida) {
        throw new Error("license_expired");
      }

      if (window.SoftSysSession?.persistSessionUser) {
        window.SoftSysSession.persistSessionUser(data.usuario);
      } else {
        localStorage.setItem("usuario", JSON.stringify(data.usuario));
      }
      localStorage.setItem("licenciaVencida", "0");

      if (data?.licencia?.fecha_vencimiento_num) {
        localStorage.setItem("licenciaVencimientoNum", String(data.licencia.fecha_vencimiento_num));
      }

      window.sesion = data.usuario;
      window.SoftSysSession?.startIdleGuard?.();
    })
    .catch(() => {
      irLogin();
    });
})();
