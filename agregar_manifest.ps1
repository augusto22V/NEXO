# Agrega el link del manifest.json en todos los HTML

$files = @(
  'frontend\home.html',
  'frontend\modulos\caja\caja.html',
  'frontend\modulos\categorias\categorias.html',
  'frontend\modulos\cliente\cliente.html',
  'frontend\modulos\compra\compra.html',
  'frontend\modulos\comprador\comprador.html',
  'frontend\modulos\herramientas\cotizacion.html',
  'frontend\modulos\herramientas\herramientas.html',
  'frontend\modulos\Informes\informe_compra.html',
  'frontend\modulos\movimientos\movimientos.html',
  'frontend\modulos\movimientoVenta\movimientoVenta.html',
  'frontend\modulos\precio\precio.html',
  'frontend\modulos\productos\productos.html',
  'frontend\modulos\productos\selector-producto.html',
  'frontend\modulos\proveedores\proveedores.html',
  'frontend\modulos\sorteo\sorteo.html',
  'frontend\modulos\vendedor\vendedor.html',
  'frontend\modulos\venta\venta.html'
)

$inject = "    <meta name=`"mobile-web-app-capable`" content=`"yes`">`n    <meta name=`"apple-mobile-web-app-capable`" content=`"yes`">`n    <link rel=`"manifest`" href=`"/manifest.json`">"

foreach ($f in $files) {
  if (Test-Path $f) {
    $content = Get-Content $f -Raw -Encoding UTF8
    if ($content -notmatch 'manifest\.json') {
      $content = $content -replace '(<meta charset="[^"]+"\s*>)', "`$1`n$inject"
      [System.IO.File]::WriteAllText((Resolve-Path $f).Path, $content, [System.Text.UTF8Encoding]::new($false))
      Write-Host "[OK] $f"
    } else {
      Write-Host "[YA TIENE] $f"
    }
  } else {
    Write-Host "[NO EXISTE] $f"
  }
}
