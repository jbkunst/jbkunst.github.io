# Nürburgring: caminos con R

Ejecutar los chunks de `index.qmd` en orden, desde la raíz del repositorio o desde
la carpeta del post. `here` fija la raíz y `post_file()` resuelve las rutas de
datos e imágenes. No hace falta cambiar el directorio de trabajo.

Para renderizar, desde la raíz:

```bash
quarto render blog/posts/2026-09-08-nurburgring-roads-in-r/index.qmd
```

La primera ejecución descarga OSM y guarda `data/osm-region.rds`. Las siguientes
leen ese archivo. Para actualizar los datos o cambiar el área descargada,
eliminar ese RDS y volver a ejecutar.

Se necesita el entorno habitual del blog y el paquete `here`; los demás paquetes
del post se declaran en el setup. En una instalación nueva:

```r
install.packages(c("here", "ggplot2", "knitr", "highcharter", "sysfonts", "showtext", "rmarkdown"))
```

El QMD genera `images/roads-plate.png`, `images/roads-plate.svg` e
`images/preview.png`. El encabezado y la miniatura usan verde bosque `#1B5E20`
(Material Green 900), una elección editorial inspirada en el Infierno Verde.

El post sigue como borrador hasta completar la descarga y la revisión visual.
