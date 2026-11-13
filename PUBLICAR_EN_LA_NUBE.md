# Publicar la app gratis en internet

Así la app funciona desde el celular, en cualquier red, **aunque tu PC esté apagada**.

- **Render** (render.com): corre el programa. Gratis.
- **Neon** (neon.tech): guarda la base de datos. Gratis, no vence.

## 1. Crear la base de datos en Neon (5 min)

1. Entrá a https://neon.tech y registrate con tu cuenta de GitHub.
2. Creá un proyecto (nombre: `libreria-sys`, región: la más cercana, por ejemplo *São Paulo*).
3. En **Connection string** copiá la dirección. Empieza con `postgresql://...` y termina con `?sslmode=require`. Guardala.

## 2. Pasar tus datos de la PC a Neon (2 min)

1. En tu PC (con PostgreSQL prendido), hacé doble clic en `subir_base_a_la_nube.bat` (está en la carpeta del proyecto).
2. Pegá la dirección de Neon y presioná Enter.
3. Esperá a que diga **Listo**.

## 3. Publicar la app en Render (5 min)

1. Entrá a https://render.com y registrate con tu cuenta de GitHub.
2. Arriba a la derecha: **New → Blueprint**.
3. Elegí el repositorio **NEXO** y tocá **Connect**. Render lee el archivo `render.yaml`.
4. Te pide `DATABASE_URL`: pegá la dirección de Neon. Tocá **Apply**.
5. Esperá unos minutos. Te da una dirección tipo `https://libreria-sys.onrender.com`.

## 4. Usarla en el celular

Abrí esa dirección en el navegador del celular y entrá con tu usuario de siempre.
Para tenerla como app: menú del navegador → **Agregar a pantalla de inicio**.

## Lo que hay que saber del plan gratis

- Si nadie la usa por 15 minutos, se "duerme". La primera vez que entrás después tarda **~1 minuto** en abrir; después anda normal.
- Las **impresoras térmicas** de tu red local no se pueden usar desde la nube.
- Las **fotos de productos** de tu PC no se suben (están fuera de GitHub), y las que subas desde la nube se pueden borrar cuando Render reinicia. Los datos sí quedan bien guardados en Neon.
- Los datos que cargues en la nube quedan en Neon, **separados** de la base de tu PC. Elegí una de las dos para trabajar.
- Cada vez que se suban cambios a la rama `main` en GitHub, Render actualiza la app solo.
