# packages helper --------------------------------------------------------
install_missing_packages <- function(packages) {
  missing <- packages[
    !vapply(packages, requireNamespace, logical(1), quietly = TRUE)
  ]

  if (length(missing)) install.packages(missing, repos = "https://cloud.r-project.org")

  invisible(missing)
}

# knitr defaults ---------------------------------------------------------
knitr::opts_chunk$set(
  warning = FALSE,
  message = FALSE
)

# ggplot2 and Highcharter themes -----------------------------------------
# Match ungrouped charts to the post's editorial accent colour. Mapped and
# explicit aesthetics still take precedence over these defaults. All state is
# kept inside the closure so the document environment stays clean.
set_plot_accent_color <- local({
  current_colour <- NULL
  colour_geoms <- c(
    "abline", "contour", "crossbar", "curve", "density", "density_2d",
    "errorbar", "freqpoly", "function", "hline", "line", "linerange",
    "path", "point", "pointrange", "qq", "qq_line", "quantile", "rug",
    "segment", "sf", "smooth", "spoke", "step", "vline"
  )

  fill_geoms <- c(
    "area", "bar", "boxplot", "col", "crossbar", "dotplot", "histogram",
    "map", "polygon", "raster", "rect", "ribbon", "sf", "smooth", "tile",
    "violin"
  )

  function(colour) {
    for (geom in colour_geoms) {
      ggplot2::update_geom_defaults(geom, list(colour = colour))
    }

    for (geom in fill_geoms) {
      ggplot2::update_geom_defaults(geom, list(fill = colour))
    }

    highcharter_theme <- getOption("highcharter.theme")
    if (inherits(highcharter_theme, "hc_theme")) {
      remaining_colours <- highcharter_theme$colors[
        !highcharter_theme$colors %in% current_colour
      ]
      highcharter_theme$colors <- unique(c(colour, remaining_colours))
      options(highcharter.theme = highcharter_theme)
    }

    current_colour <<- colour
    invisible(colour)
  }
})

local({
  font_family <- "sans"
  title_font_family <- "sans"
  accent_colour <- "#174A70"
  text_colour <- "#5F6873"
  background_colour <- "#F8F9FA"

  font_registered <- tryCatch(
    {
      sysfonts::font_add_google("IBM Plex Sans", family = "ibm")
      sysfonts::font_add_google(
        "IBM Plex Sans",
        family = "ibm-light",
        regular.wt = 300,
        bold.wt = 500
      )
      showtext::showtext_auto()
      TRUE
    },
    error = function(error) FALSE
  )

  if (font_registered) {
    font_family <- "ibm"
    title_font_family <- "ibm-light"
  }

  ggplot2::theme_set(
    ggplot2::theme_minimal(base_size = 8, base_family = font_family) +
      ggplot2::theme(
        plot.title = ggplot2::element_text(
          family = title_font_family,
          face = "plain",
          size = 11
        ),
        axis.text = ggplot2::element_text(colour = text_colour),
        plot.background = ggplot2::element_rect(
          fill = background_colour,
          colour = NA
        ),
        panel.background = ggplot2::element_rect(
          fill = background_colour,
          colour = NA
        ),
        panel.grid.major = ggplot2::element_line(
          colour = "#E1E5EA",
          linewidth = 0.35
        ),
        panel.grid.minor = ggplot2::element_line(
          colour = "#EEF0F3",
          linewidth = 0.25
        ),
        legend.position = "bottom",
        legend.key.width = grid::unit(1.5, "cm")
      )
  )

  set_plot_accent_color(accent_colour)

  highcharter_font_family <- paste(
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,',
    'sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"'
  )

  options(
    highcharter.theme =
      highcharter::hc_theme_smpl(
        chart = list(
          backgroundColor = background_colour,
          style = list(fontFamily = highcharter_font_family)
        ),
        title = list(style = list(fontFamily = highcharter_font_family)),
        subtitle = list(style = list(fontFamily = highcharter_font_family)),
        credits = list(style = list(fontFamily = highcharter_font_family)),
        legend = list(
          itemStyle = list(fontWeight = "normal", color = text_colour)
        )
      )
  )

  set_plot_accent_color(accent_colour)
})
