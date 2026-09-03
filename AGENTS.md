# Guía de trabajo del sitio

Este repositorio contiene el sitio personal y blog de Joshua Kunst, construido con Quarto. Al modificarlo, prioriza soluciones nativas de Quarto, poco CSS personalizado y posts que puedan renderizarse de forma independiente.

## Estructura

- `index.qmd`: landing page.
- `blog/index.qmd`: listado del blog.
- `blog/posts/<fecha-slug>/index.qmd`: cada post vive en su propia carpeta.
- `blog/_R/post_setup.R`: helpers y configuración compartida de R.
- `blog/_metadata.yml`: formato general del blog.
- `blog/posts/_metadata.yml`: defaults de todos los posts.
- `assets/`: CSS, JavaScript, fuentes e imágenes compartidas.
- `docs/`: sitio renderizado para GitHub Pages. No editar manualmente.

## Front matter de los posts

- Usar `title`, `description`, `author`, `date` y `categories` cuando corresponda.
- Usar `description` como bajada breve y texto de la tarjeta del listado.
- No usar `subtitle`: evita repetir contenido entre el banner, la tarjeta y el artículo.
- Mantener las descripciones breves, concretas y preferentemente en una sola oración.
- Escribir fechas YAML sin comillas en formato ISO: `date: 2026-08-13`.
- Los títulos pueden ir sin comillas, salvo que contengan caracteres que YAML pueda interpretar de manera especial.
- La fecha es editorial. No usar `Sys.Date()` ni generar fechas durante el render.

Ejemplo:

```yaml
---
title: Visualizing data with R
description: A practical exploration of patterns, models and visualization.
author: Joshua Kunst
date: 2026-08-13
categories: [R, visualization]
---
```

## Código R y paquetes

- Al inicio de cada post, incluir un chunk `setup` que cargue el helper compartido.
- Declarar en `install_missing_packages()` todos los paquetes que el post necesita.
- El helper instala únicamente los paquetes ausentes; no los carga.
- Mantener cada `library()` en el lugar original o lógico del post.
- Preferir llamadas explícitas con `paquete::funcion()` en el helper compartido.
- No instalar paquetes silenciosamente fuera del chunk `setup`.
- No depender de paquetes archivados o funciones obsoletas cuando exista una alternativa mantenida.
- Reemplazar APIs antiguas, por ejemplo `dplyr::tbl_df()` por `tibble::as_tibble()`.
- Si un paquete no está en CRAN, documentar su fuente explícitamente en vez de hacer fallar una instalación genérica.

Patrón recomendado:

````markdown
```{r}
#| label: setup
#| include: false

source("../../_R/post_setup.R")

install_missing_packages(c(
  "dplyr",
  "ggplot2"
))
```

```{r}
#| label: load-packages
#| message: false

library(dplyr)
library(ggplot2)
```
````

Usar `message: false` para ocultar mensajes de carga. `echo: false` oculta el código, no los mensajes.

## Chunks

- Todos los chunks deben tener un `label` único y descriptivo.
- Nombrar por intención, por ejemplo `prepare-model-data`, `fit-linear-model` o `plot-residuals`.
- Evitar nombres genéricos como `chunk-1`, `step-2` o `unnamed-chunk`.
- Mantener las opciones del chunk cerca del código al que afectan.
- Mantener `code-tools` desactivado por defecto y activarlo solo en los posts donde aporte valor.
- Cuando se active, mostrar únicamente `Show All Code` y `Hide All Code`; mantener oculta la acción `Show Source` mediante el estilo compartido.
- Mostrar el código por defecto. Aplicar `code-fold: true` solo a chunks realmente largos, usando 50 líneas reales de código como referencia, o cuando un bloque auxiliar interrumpa claramente la narración.
- No plegar automáticamente un chunk largo cuando explicar ese código sea el propósito central de la sección.
- Al medir la longitud, no contar opciones de Quarto, comentarios ni líneas vacías; excluir también chunks `setup`, `include: false` y `echo: false`.
- Para acceder al documento completo, preferir un enlace discreto al archivo fuente en GitHub.
- No fijar `fig-width` y `fig-height` en cada chunk salvo que la figura realmente necesite otra proporción.
- Dejar que Quarto determine las dimensiones nativas salvo que una figura necesite otra proporción.

## Datos y recursos

- Guardar los datos específicos de un post dentro de la carpeta de ese post, idealmente en `data/`.
- Usar rutas relativas a la carpeta del documento.
- No usar rutas absolutas del computador local ni rutas heredadas del repositorio antiguo.
- Evitar scraping remoto durante el render cuando el contenido es pequeño y estable. Guardar una copia local o definir los datos explícitamente.
- Mantener junto al post las imágenes y archivos que solo ese artículo utiliza.

Ejemplo:

```r
readr::read_csv("data/observations.csv")
```

## Figuras y layout

- El ancho del texto es deliberadamente angosto; las figuras pueden usar el espacio de página cuando lo necesitan.
- Usar `blog/posts/2000-01-01-quarto-post-example/index.qmd` como referencia visual para tipografía, escala, ancho y presentación de figuras.
- Las figuras usan SVG y alineación centrada mediante `blog/posts/_metadata.yml`; no repetir estas opciones dentro de cada post.
- El tema compartido se define en `blog/_R/post_setup.R`. Los posts deben heredarlo en vez de llamar nuevamente a `theme_set()`, `theme_minimal()` o registrar fuentes.
- Mantener `base_size`, familia tipográfica y tamaños comunes de anotaciones en el setup compartido.
- La escala compartida es: título 18, subtítulo 14, títulos de ejes 13, textos de ejes 11, facetas 12, título de leyenda 11 y texto de leyenda 11.
- Mostrar una figura por fila como regla general. Usar `layout-ncol` solo cuando la comparación simultánea entre paneles sea parte del argumento del post y las etiquetas sigan siendo legibles.
- Para una figura más ancha que el texto, preferir la opción nativa `column: page` o `column: screen-inset` antes que CSS específico.
- Mantener `column: body` como default para gráficos sencillos. Usar `column: page` explícitamente en visualizaciones complejas, árboles, redes, mapas, composiciones o gráficos con muchas etiquetas.
- No agregar dimensiones grandes solo para ensanchar una figura: eso también cambia su escala tipográfica y puede producir scroll horizontal.
- No fijar `fig-width`, `fig-height` ni `out-width` por post salvo que exista una necesidad concreta que el default no resuelva.
- Las figuras deben ser responsivas y no provocar overflow en pantallas de 1080p o menores.
- El tema compartido de ggplot2 usa IBM Plex Sans cuando está disponible, tamaño base 15 y leyenda abajo.
- No repetir la escala tipográfica en cada gráfico. Usar ajustes locales solo cuando la visualización lo necesite, por ejemplo texto de tamaño 3 o 6 en matrices muy densas.
- Evitar `theme_minimal(base_size = ...)` dentro de los posts porque reemplaza el tema compartido, salvo que sea una decisión intencional y documentada para esa figura.
- Mantener ajustes de paquetes especializados, como `ggforce::geom_mark_*()` y `ggparty`, dentro del post que los utiliza. No convertirlos en defaults globales sin un segundo caso de uso realmente común.
- Usar estos valores como punto de partida para `ggforce::geom_mark_*()`: `label.fontsize = 8` y `description.fontsize = 7`. Aplicar `family = plot_font_family` o sus argumentos equivalentes cuando el geom no herede la fuente.
- Usar estos valores como punto de partida para árboles de `ggparty`: etiquetas de aristas en `size = 2.5`, etiquetas de nodos en `size = 3` y ejes de gráficos internos con `element_text(size = rel(0.65))`. Preferir etiquetas terminales breves y en dos líneas.
- En composiciones pequeñas o mosaicos, crear una copia simplificada del gráfico en vez de degradar el original. Quitar etiquetas densas, leyendas o capas solo en esa copia; por ejemplo, usar un dendrograma sin `GeomText` dentro del resumen y conservar los nombres en su figura individual.
- Permitir overrides locales únicamente cuando la estructura del gráfico lo exija, por ejemplo `theme_void()` o texto reducido en una matriz muy densa. Documentar la razón junto al código.
- Al migrar o agregar un post, renderizarlo y compararlo con “Quarto post example” antes de considerarlo terminado.

## Diseño del sitio

- Mantener IBM Plex Sans como tipografía principal.
- Preservar la identidad azul moderna del landing, navbar y banners.
- El landing puede ser dinámico; el blog debe sentirse más calmado, legible y editorial.
- Favorecer el navbar nativo de Quarto con el CSS compartido.
- Tratar el color de navbar, banner de título y footer como una decisión editorial de cada post. Para cambiarlo, añadir inmediatamente después del front matter una sola línea que defina `--blog-background`; los tres elementos heredarán ese color.
- Cuando el fondo particular de un post sea claro, definir en la misma línea `--blog-foreground` y `--blog-hover` con colores oscuros que mantengan buen contraste. Los fondos oscuros deben heredar el primer plano claro compartido.
- Al elegir colores temáticos, usar la paleta de Google Material como referencia para obtener tonos sólidos y vivos. Preferir intensidades 700–900 con texto claro e intensidades 400–600 con texto oscuro, verificando siempre el contraste real.
- Mantener una relación bidireccional entre el color editorial del post y sus visualizaciones: si el navbar y el banner tienen un color temático, reutilizarlo como acento principal en los `geom_*()` de ggplot2 o mediante `hc_colors()` en highcharter; si una visualización ya tiene un color dominante relevante, considerarlo para `--blog-background`. Conservar paletas distintas cuando codifiquen categorías o significados propios de los datos.
- No crear CSS ni JavaScript compartido adicional solo para registrar colores por post; mantener este override pequeño y localizado junto al contenido.
- No añadir un TOC por defecto. Solo habilitarlo en un post si aporta valor y no perjudica el layout.
- Evitar CSS por post. Primero intentar resolver el problema mediante YAML y layouts nativos de Quarto.

## Renderizado y verificación

- Durante la migración, renderizar un post a la vez para encontrar errores con claridad.
- Para compilar un único archivo sin iniciar el servidor de preview:

```powershell
quarto render blog/posts/<fecha-slug>/index.qmd
```

- `quarto preview` puede observar el proyecto y disparar renders adicionales; usar `quarto render` para una prueba aislada.
- `freeze: auto` reutiliza resultados si el código fuente del documento no cambió. Los cambios de estilos o navbar no deberían exigir recalcular los chunks.
- Si es necesario recalcular un post, borrar únicamente su salida correspondiente dentro de `_freeze` o usar un render sin freeze; no borrar todo el proyecto.
- No renderizar automáticamente posts extensos después de una edición menor. Dejar que el usuario los pruebe uno por uno, salvo que solicite verificación completa.

## Al corregir migraciones

- Ante un error, corregir también el mismo patrón en los demás posts si existe.
- Después de la corrección, indicar el archivo afectado con un enlace a la línea 1 para que pueda abrirse y renderizarse.
- Preservar el contenido y el estilo editorial original; hacer solo cambios técnicos necesarios para compatibilidad.
- No editar `docs/` ni `_freeze/` a mano como sustituto de corregir la fuente `.qmd`.
