# Nürburgring: primer post, caminos con R

Este borrador se concentra en aprender el proceso y recorrer el código paso a
paso. Todo el código cartográfico está en `index.qmd`; el único helper externo
es el setup habitual del blog. El relieve con rayshader se trabajará después.
Visual Data Sketches queda para una etapa posterior, cuando los posts funcionen.

## Alcance

- Contexto breve de Eifel y del circuito, con una fuente oficial.
- Ventana regional de 56 × 42 km y ventana cercana de 16 × 12 km, ambas 4:3.
- Caminos de distintas categorías, incluyendo pistas de carreras, autopistas,
  conexiones regionales, calles locales, accesos, caminos agrícolas/forestales y
  vías no motorizadas, según existan en el recorte de OSM.
- Secuencia gráfica: trazo uniforme → grosores → contexto regional → lámina final.
- Exportación PNG/SVG y preview generado desde el propio QMD con el fondo del
  encabezado, siguiendo `AGENTS.md`.

El grosor es una decisión cartográfica por categoría, no una medición física.
La capa `raceway` no se presenta como una vuelta oficial ordenada: puede incluir
Nordschleife, GP y conexiones. Todavía no se calculan tiempos, velocidades ni
distancias de competición.

## Primera ejecución

Requiere R y Quarto, más el entorno que utiliza el resto del blog. El setup
compartido necesita `ggplot2`, `knitr`, `highcharter`, `sysfonts` y `showtext`.
Si es una instalación nueva, instalar los paquetes explícitamente desde R:

```r
install.packages(c(
  "ggplot2", "knitr", "highcharter", "sysfonts", "showtext", "dplyr", "sf",
  "osmdata", "xml2", "tibble", "svglite", "rmarkdown"
), repos = "https://cloud.r-project.org")
```

Desde la raíz del repo:

```bash
quarto render blog/posts/2026-09-08-nurburgring-roads-in-r/index.qmd -P download_osm:true
```

La primera ejecución consulta Overpass. Conserva la respuesta en
`data/raw/osm-region.xml` y guarda la consulta al lado. Si Overpass falla,
el error permanece visible; el documento no sustituye datos reales por datos
de ejemplo. Reintentar más tarde la misma ejecución.

Para trabajar chunk por chunk en Positron/RStudio, usar como directorio de
trabajo la carpeta del QMD. Si la sesión interactiva no define los parámetros de
Quarto, ejecutar antes `params <- list(download_osm = TRUE)`.

## Renders posteriores

```bash
quarto render blog/posts/2026-09-08-nurburgring-roads-in-r/index.qmd
```

Se reutiliza el XML descargado. El parámetro `download_osm` permite la primera
descarga, pero no fuerza actualizaciones. Para actualizar deliberadamente la
copia, archivar o eliminar solo `data/raw/osm-region.xml` y volver a renderizar
con `-P download_osm:true`. Archivar también `osm-query.txt` y `osm-source.csv`
si se desea conservar la trazabilidad de la versión anterior.

Los XML y archivos de metadatos locales están ignorados por Git. Antes de publicar,
decidir dónde conservar una copia descargable del snapshot si se necesita repetir
exactamente esta edición de los datos, además de repetir el procedimiento.

## Salidas

- `images/roads-plate.png`: lámina cercana, 4:3.
- `images/roads-plate.svg`: la misma lámina vectorial.
- `images/preview.png`: miniatura derivada de la lámina, fondo azul editorial.
- `images/render-session.txt`: versiones utilizadas en el render.
- `data/osm-source.csv`: fecha OSM, atribución y huella de la descarga.
- Las cuatro etapas gráficas del artículo las exporta Quarto normalmente.

## Estado del borrador

`draft: true` se mantiene hasta ejecutar el post con los datos reales y revisar
su presentación. Aún falta la verificación visual frente al post de referencia
`2000-01-01-quarto-post-example`, exigida por `AGENTS.md`.

Antes de publicarlo, revisar:

1. Presencia real de las categorías de interés en la tabla de cobertura,
   especialmente las autopistas en el encuadre regional.
2. Visibilidad de los alrededores, detalle de los caminos menores y etiquetas.
3. Coherencia entre las cuatro etapas y legibilidad a ancho de página y en móvil.
4. Preview regenerado desde el QMD y coherente con el encabezado.

No editar `docs/` ni `_freeze/` a mano. Retirar `draft: true` después de la
revisión editorial y generar la salida mediante el flujo habitual de Quarto.
