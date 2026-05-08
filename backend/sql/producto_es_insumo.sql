BEGIN;

ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS es_insumo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_producto_es_insumo ON producto(es_insumo);
CREATE INDEX IF NOT EXISTS idx_producto_destino_impresion ON producto(destino_impresion);

COMMIT;
//npm run apk:debug
//Configurar Android SDK (ANDROID_HOME o sdk.dir).
//Ejecutar en mobile/softsys-capacitor: npm run apk:debug.
//Instalar android/app/build/outputs/apk/debug/app-debug.apk en tablet/celular.
//C:\Sys\mobile\softsys-capacitor\android\app\build\outputs\apk\debug\app-debug.apk