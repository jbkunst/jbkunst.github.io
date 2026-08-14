extract_widget_options <- function(path) {
  html <- paste(readLines(path, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
  matches <- regmatches(
    html,
    regexpr(
      '<script type="application/json" data-for="[^"]+">.*?</script>',
      html,
      perl = TRUE
    )
  )

  if (!length(matches) || !nzchar(matches)) {
    stop("No htmlwidget JSON payload was found in ", path)
  }

  json <- sub("^[^>]+>", "", matches)
  json <- sub("</script>$", "", json)

  jsonlite::fromJSON(json, simplifyVector = FALSE)$x$hc_opts
}

phone_options <- extract_widget_options("source/phone-height-chart.html")
phone_series <- phone_options$series
phone_names <- vapply(phone_series, `[[`, character(1), "name")
all_phones <- phone_series[[which(phone_names == "All Phones")]]$data

phones <- dplyr::bind_rows(all_phones) |>
  dplyr::transmute(
    launch_date = as.Date(launch_date),
    brand = brand_name,
    model = phn,
    height_mm = as.numeric(height),
    brand_color = brand_color_2
  ) |>
  dplyr::distinct()

brand_options <- extract_widget_options("source/brands-chart.html")
brand_series <- brand_options$series
brand_points <- brand_series[[1]]$data

brands <- dplyr::bind_rows(brand_points) |>
  dplyr::transmute(
    brand = brand_name,
    models = as.integer(y),
    color = brand_color
  ) |>
  dplyr::distinct()

readr::write_csv(phones, "data/phones-2016.csv")
readr::write_csv(brands, "data/brands-2016.csv")

message("Recovered ", nrow(phones), " phones and ", nrow(brands), " brands.")
