# Serve the rendered site without running Quarto or recalculating any post.
if (!requireNamespace("httpuv", quietly = TRUE)) {
  stop("The httpuv package is required to serve the local preview.")
}

site_dir <- normalizePath("docs", winslash = "/", mustWork = TRUE)
post_path <- "blog/posts/0000-00-00-nurburgring-in-3d-with-rayshader/"
preview_url <- paste0("http://127.0.0.1:8000/", post_path)

mime_type <- function(path) {
  extension <- tolower(tools::file_ext(path))
  types <- c(
    css = "text/css; charset=utf-8",
    html = "text/html; charset=utf-8",
    js = "text/javascript; charset=utf-8",
    json = "application/json; charset=utf-8",
    png = "image/png",
    svg = "image/svg+xml",
    woff = "font/woff",
    woff2 = "font/woff2"
  )

  if (extension %in% names(types)) {
    unname(types[[extension]])
  } else {
    "application/octet-stream"
  }
}

# Resolve each URL under docs/ and reject paths that attempt to leave that directory.
serve_file <- function(request) {
  relative_path <- utils::URLdecode(sub("^/", "", request$PATH_INFO))
  relative_path <- if (identical(relative_path, "")) "index.html" else relative_path
  file_path <- normalizePath(
    file.path(site_dir, relative_path),
    winslash = "/",
    mustWork = FALSE
  )

  if (!startsWith(tolower(file_path), tolower(site_dir))) {
    return(list(status = 403L, body = "Forbidden"))
  }
  if (dir.exists(file_path)) {
    file_path <- file.path(file_path, "index.html")
  }

  if (!file.exists(file_path)) {
    return(list(status = 404L, body = "Not found"))
  }

  list(
    status = 200L,
    headers = list("Content-Type" = mime_type(file_path)),
    body = readBin(file_path, "raw", n = file.info(file_path)$size)
  )
}

server <- httpuv::startServer("127.0.0.1", 8000, list(call = serve_file))
on.exit(httpuv::stopServer(server), add = TRUE)

message("Serving only existing files in docs/. No Quarto render will run.")
message("Open ", preview_url, " and stop this script with Esc or Ctrl+C.")
utils::browseURL(preview_url)

repeat {
  httpuv::service(100)
}
