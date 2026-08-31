# Reference only: the interactive hero removed from index.qmd.
# This file is not sourced by the post. It expects `ferrari` and dplyr to exist.

featured <- ferrari |>
  filter(model == "365 GTB4") |>
  slice(1)

escape_html <- function(x, attribute = FALSE) {
  htmltools::htmlEscape(coalesce(as.character(x), ""), attribute = attribute)
}

cat(
  '<style>',
  '.ferrari-feature{display:grid;grid-template-columns:minmax(250px,.78fr) minmax(0,1.22fr);min-height:390px;background:#161412;color:#fff;margin:2rem 0 1rem;overflow:hidden}',
  '.ferrari-feature-copy{display:flex;flex-direction:column;justify-content:flex-end;padding:clamp(2rem,5vw,4.5rem)}',
  '.ferrari-feature-kicker{color:#ef2438;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;margin-bottom:1rem}',
  '.ferrari-feature h3{color:#fff;font-size:clamp(2.3rem,5vw,4.8rem);font-weight:200;line-height:.95;margin:0 0 1rem}',
  '.ferrari-feature-meta{color:#d6d0c9;font-size:.88rem;letter-spacing:.06em;text-transform:uppercase}',
  '.ferrari-feature-description{color:#bcb5ad;max-width:34rem;margin:1.3rem 0 0}',
  '.ferrari-feature-media{position:relative;min-height:390px;background:#2b2824}',
  '.ferrari-feature-media img{width:100%;height:100%;object-fit:cover;display:block}',
  '@media(max-width:760px){.ferrari-feature{grid-template-columns:1fr}.ferrari-feature-media{min-height:260px;order:-1}.ferrari-feature-copy{padding:2rem}}',
  '</style>',
  '<div class="ferrari-feature">',
  '<div class="ferrari-feature-copy">',
  '<div class="ferrari-feature-kicker">Selected bloodline</div>',
  sprintf('<h3 id="ferrari-feature-name">%s</h3>', escape_html(featured$model)),
  sprintf(
    '<div id="ferrari-feature-meta" class="ferrari-feature-meta">%s · %s</div>',
    escape_html(featured$start_year),
    escape_html(featured$main_family)
  ),
  sprintf(
    '<p id="ferrari-feature-description" class="ferrari-feature-description">%s</p>',
    escape_html(featured$description)
  ),
  '</div>',
  '<div class="ferrari-feature-media">',
  sprintf(
    '<img id="ferrari-feature-image" src="%s" alt="%s">',
    escape_html(featured$image_url, TRUE),
    escape_html(featured$model, TRUE)
  ),
  '</div>',
  '</div>',
  sep = "\n"
)

# Original Highcharts click handler used to update the hero.
select_model_js <- htmlwidgets::JS(
  "function () {",
  "  const c = this.custom || {};",
  "  const image = document.getElementById('ferrari-feature-image');",
  "  const name = document.getElementById('ferrari-feature-name');",
  "  const meta = document.getElementById('ferrari-feature-meta');",
  "  const description = document.getElementById('ferrari-feature-description');",
  "  if (name) name.textContent = this.name;",
  "  if (meta) meta.textContent = c.start + (c.end ? '–' + c.end : '') + ' · ' + c.family;",
  "  if (description) description.textContent = c.description || c.lineage;",
  "  if (image && c.image) { image.src = c.image; image.alt = this.name; }",
  "}"
)
