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

# ggplot2 theme -----------------------------------------------------------
plot_font_family <- "sans"
plot_title_font_family <- "sans"
plot_accent_color <- "#174A70"
plot_text_color <- "#5F6873"
plot_background_color <- "#F9F9F9"

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
  plot_font_family <- "ibm"
  plot_title_font_family <- "ibm-light"
}

ggplot2::theme_set(
  ggplot2::theme_minimal(base_size = 8, base_family = plot_font_family) +
    ggplot2::theme(
      plot.title = ggplot2::element_text(
        family = plot_title_font_family,
        face = "plain",
        size = 11
      ),
      axis.text = ggplot2::element_text(colour = plot_text_color),
      plot.background = ggplot2::element_rect(
        fill = plot_background_color,
        colour = NA
      ),
      panel.background = ggplot2::element_rect(
        fill = plot_background_color,
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

# Match ungrouped line charts to the blog's default editorial blue.
for (geom in c("line", "path", "step")) {
  ggplot2::update_geom_defaults(geom, list(colour = plot_accent_color))
}
rm(geom)
rm(plot_title_font_family)

# highcharter theme -------------------------------------------------------
fntfmly <- '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"'

options(
  highcharter.theme =
    highcharter::hc_theme_smpl(
      chart = list(style = list(fontFamily = fntfmly)),
      title = list(style = list(fontFamily = fntfmly)),
      subtitle = list(style = list(fontFamily = fntfmly)),
      credits = list(style = list(fontFamily = fntfmly)),
      legend = list(
        itemStyle = list(fontWeight = "normal", color = plot_text_color)
      )
    )
)

rm(fntfmly)
rm(font_registered)
