# SoftSys Android (Capacitor, variantes Local y Casa)

Este wrapper convierte el sistema web en dos apps Android instalables al mismo tiempo:

- `SoftSys` para red local con IP interna.
- `SoftSys Casa` para IP publica o dominio en nube.

## 1) Objetivo

- Mantener un unico codigo base.
- Cambiar solo identidad Android y configuracion de URL.
- Permitir instalar ambas apps en el mismo dispositivo sin conflictos.
- Abrir siempre en WebView nativo fullscreen.

## 2) Estructura

- `www/index.html`: pantalla setup.
- `www/app.js`: logica comun de arranque, reconexion y deteccion de variante.
- `www/mobile-config.json`: configuracion base de `SoftSys` local.
- `android/app/src/casa/assets/public/mobile-config.json`: configuracion remota de `SoftSys Casa`.
- `android/app/src/casa/res/values/strings.xml`: nombre visible y custom scheme de `SoftSys Casa`.
- `android/app/src/casa/assets/capacitor.config.json`: metadata Capacitor de `SoftSys Casa`.

## 3) Instalacion Capacitor

En `mobile/softsys-capacitor`:

```bash
npm install
npm run android:add
npm run android:config
npm run android:sync
npm run android:open
```

## 4) Configurar SoftSys Casa

Antes de compilar la variante remota, edita este archivo:

`android/app/src/casa/assets/public/mobile-config.json`

Ejemplo:

```json
{
  "appName": "SoftSys Casa",
  "setupDescription": "Conecta la app con tu servidor remoto o en la nube.",
  "setupHint": "Servidor remoto configurado en la app.",
  "fixedBaseUrl": "https://tu-dominio-o-ip-publica.com"
}
```

`fixedBaseUrl` acepta por ejemplo:

- `https://softsys.midominio.com`
- `http://181.123.45.67:3000`

## 5) Generar APK

### SoftSys local

```bash
npm run apk:local:debug
npm run apk:local:release
```

Salida:

- `android/app/build/outputs/apk/local/debug/`
- `android/app/build/outputs/apk/local/release/`

### SoftSys Casa

```bash
npm run apk:casa:debug
npm run apk:casa:release
```

Salida:

- `android/app/build/outputs/apk/casa/debug/`
- `android/app/build/outputs/apk/casa/release/`

## 6) Identidad Android

- `SoftSys`: `applicationId = com.softsys.lanapp`
- `SoftSys Casa`: `applicationId = com.softsys.lanapp.casa`

Eso permite instalar ambas apps al mismo tiempo en el mismo equipo.

## 7) Flujo de uso

1. Abrir `SoftSys` para LAN o `SoftSys Casa` para nube.
2. `SoftSys` pide IP y puerto la primera vez y luego los guarda.
3. `SoftSys Casa` usa la `fixedBaseUrl` configurada en su flavor.
4. La app valida `GET /api/health`.
5. Si conecta, abre `.../login/login.html` dentro del WebView.
6. Si falla, muestra estado y reintenta automaticamente.

## 8) Endpoint de salud recomendado

Backend: `GET /api/health` -> `{ ok: true, app: "softsys" }`
