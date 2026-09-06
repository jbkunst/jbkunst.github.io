# Attribute preparation ----------------------------------------------------
# Each original attribute receives total sample variance 1. A categorical
# attribute is a whole block, not one independently standardized dummy per level.
prepare_pokemon_profile <- function(pokemon) {
  numeric_names <- c(
    "height_m", "weight_kg", "hp", "attack", "defense", "special_attack",
    "special_defense", "speed", "hatch_counter"
  )
  raw <- as.data.frame(pokemon)
  raw$height_m <- raw$height / 10
  raw$weight_kg <- raw$weight / 10
  numeric_data <- raw[numeric_names]
  numeric_missing <- vapply(numeric_data, function(x) sum(!is.finite(x)), integer(1))
  for (name in numeric_names) {
    x <- numeric_data[[name]]
    if (!any(is.finite(x))) stop("No observed values for ", name)
    x[!is.finite(x)] <- stats::median(x[is.finite(x)])
    numeric_data[[name]] <- x
  }
  transformed <- numeric_data
  transformed[c("height_m", "weight_kg")] <- lapply(
    transformed[c("height_m", "weight_kg")], log1p
  )
  blocks <- lapply(transformed, function(x) matrix(x, ncol = 1))
  for (name in names(blocks)) colnames(blocks[[name]]) <- name

  clean_category <- function(x) {
    x <- as.character(x)
    x[is.na(x) | x == ""] <- "unknown"
    x
  }
  categories <- data.frame(
    body_shape = clean_category(raw$body_shape),
    body_color = clean_category(raw$body_color),
    sex_profile = ifelse(
      is.na(raw$gender_rate), "unknown",
      ifelse(raw$gender_rate == -1, "genderless", paste0("female_", raw$gender_rate, "_of_8"))
    ),
    visible_sex_differences = ifelse(
      is.na(raw$has_gender_differences), "unknown",
      ifelse(raw$has_gender_differences == 1, "yes", "no")
    )
  )
  for (name in names(categories)) {
    values <- categories[[name]]
    levels <- sort(unique(values))
    block <- vapply(levels, function(level) as.numeric(values == level), numeric(nrow(raw)))
    colnames(block) <- paste(name, levels, sep = "__")
    blocks[[name]] <- block
    categories[[name]] <- factor(values, levels = levels)
  }

  # Egg-group slots have no biological ordering. A shared group should still
  # contribute similarity when the second group differs.
  egg_1 <- clean_category(raw$egg_group_1)
  egg_2 <- clean_category(raw$egg_group_2)
  egg_levels <- sort(setdiff(unique(c(egg_1, egg_2)), c("none", "unknown")))
  egg_bits <- vapply(egg_levels, function(level) as.numeric(egg_1 == level | egg_2 == level), numeric(nrow(raw)))
  colnames(egg_bits) <- paste0("egg_", make.names(egg_levels))
  blocks$egg_groups <- egg_bits

  scales <- vapply(blocks, function(block) sqrt(sum(apply(block, 2, stats::var))), numeric(1))
  informative <- scales > 0 & is.finite(scales)
  x <- do.call(cbind, lapply(names(blocks)[informative], function(name) {
    block <- blocks[[name]]
    sweep(block, 2, colMeans(block), "-") / scales[[name]]
  }))
  rownames(x) <- as.character(raw$id)
  missing <- c(
    numeric_missing,
    body_shape = sum(categories$body_shape == "unknown"),
    body_color = sum(categories$body_color == "unknown"),
    sex_profile = sum(categories$sex_profile == "unknown"),
    visible_sex_differences = sum(categories$visible_sex_differences == "unknown"),
    egg_groups = sum(egg_1 %in% c("none", "unknown") & egg_2 %in% c("none", "unknown"))
  )
  audit <- data.frame(
    attribute = names(blocks),
    columns = vapply(blocks, ncol, integer(1)),
    missing = as.integer(missing[names(blocks)]),
    variance_budget = as.numeric(informative),
    row.names = NULL
  )
  z_numeric <- x[, numeric_names, drop = FALSE]
  # The surrogate uses understandable units, not UMAP coordinates or z scores.
  tree_data <- cbind(numeric_data, categories, as.data.frame(egg_bits))
  stopifnot(!anyDuplicated(raw$id), all(is.finite(x)), nrow(x) == nrow(raw))
  list(x = x, audit = audit, z_numeric = z_numeric, tree_data = tree_data)
}

# Projection and comparison ------------------------------------------------
fit_pokemon_map <- function(x, dimensions, seed, neighbors = 30L, min_dist = 0.15) {
  set.seed(seed)
  result <- uwot::umap(
    x, n_components = dimensions, n_neighbors = neighbors,
    min_dist = min_dist, metric = "euclidean", n_epochs = 500L,
    nn_method = "fnn", n_threads = 1L, n_sgd_threads = 1L, verbose = FALSE
  )
  unname(as.matrix(result))
}

adjusted_rand <- function(a, b) {
  # ARI is invariant to arbitrary cluster numbers. Degenerate partitions are
  # reported as unavailable instead of making all-noise agreement look useful.
  if (length(a) < 2L || length(unique(a)) < 2L || length(unique(b)) < 2L) return(NA_real_)
  choose_two <- function(x) x * (x - 1) / 2
  counts <- table(a, b)
  pairs <- choose_two(sum(counts))
  rows <- sum(choose_two(rowSums(counts)))
  columns <- sum(choose_two(colSums(counts)))
  expected <- rows * columns / pairs
  denominator <- (rows + columns) / 2 - expected
  if (denominator == 0) return(NA_real_)
  (sum(choose_two(counts)) - expected) / denominator
}

compare_assignments <- function(a, b) {
  assigned <- a > 0 & b > 0
  data.frame(
    ari_all = adjusted_rand(a, b),
    jointly_assigned = sum(assigned),
    ari_assigned = adjusted_rand(a[assigned], b[assigned]),
    noise_agreement = mean((a == 0) == (b == 0))
  )
}

nearest_indices <- function(x, k = 15L) {
  distances <- as.matrix(stats::dist(x))
  diag(distances) <- Inf
  # Fixed row/ID ordering provides a reproducible tie break for equal distances.
  t(apply(distances, 1, function(row) order(row)[seq_len(k)]))
}

neighbor_recall <- function(original_neighbors, embedding, k = ncol(original_neighbors)) {
  embedded_neighbors <- nearest_indices(embedding, k)
  mean(vapply(seq_len(nrow(embedding)), function(i) {
    length(intersect(original_neighbors[i, ], embedded_neighbors[i, ])) / k
  }, numeric(1)))
}

cluster_representatives <- function(pokemon, x, clusters, n = 3L) {
  groups <- sort(unique(clusters[clusters > 0]))
  if (!length(groups)) return(data.frame())
  do.call(rbind, lapply(groups, function(group) {
    rows <- which(clusters == group)
    average_distance <- rowMeans(as.matrix(stats::dist(x[rows, , drop = FALSE])))
    ordered <- rows[order(average_distance)]
    family <- pokemon$evolution_chain_id[ordered]
    family_key <- ifelse(is.na(family), paste0("id_", pokemon$id[ordered]), paste0("chain_", family))
    selected <- head(ordered[!duplicated(family_key)], n)
    data.frame(
      cluster = paste0("C", group), rank = seq_along(selected),
      id = pokemon$id[selected], name = pokemon$pokemon_label[selected],
      sprite_url = pokemon$sprite_url[selected],
      average_distance = average_distance[match(selected, rows)]
    )
  }))
}

# Surrogate assessment -----------------------------------------------------
fit_cluster_surrogate <- function(pokemon, predictors, clusters, seed = 13342L) {
  rows <- which(clusters > 0)
  if (length(unique(clusters[rows])) < 2L) return(NULL)
  response <- factor(paste0("C", clusters[rows]), levels = paste0("C", sort(unique(clusters[rows]))))
  data <- data.frame(cluster = response, predictors[rows, , drop = FALSE])
  family <- pokemon$evolution_chain_id[rows]
  family <- ifelse(is.na(family), paste0("id_", pokemon$id[rows]), paste0("chain_", family))
  set.seed(seed)
  families <- sort(unique(family))
  train_families <- sample(families, max(1L, floor(0.8 * length(families))))
  train <- family %in% train_families
  if (all(train) || length(unique(response[train])) < 2L) return(NULL)
  tree <- rpart::rpart(
    cluster ~ ., data = data[train, ], method = "class",
    control = rpart::rpart.control(
      maxdepth = 3L, minbucket = 15L, minsplit = 30L, cp = 0.01,
      xval = 0L, maxsurrogate = 0L, usesurrogate = 0L
    )
  )
  predicted <- predict(tree, newdata = data, type = "class")
  probabilities <- predict(tree, newdata = data, type = "prob")
  baseline <- names(which.max(table(response[train])))
  predictions <- data.frame(
    id = pokemon$id[rows], name = pokemon$pokemon_label[rows],
    family = family, split = ifelse(train, "train", "held-out families"),
    cluster = response, predicted = predicted,
    confidence = apply(probabilities, 1, max), agrees = response == predicted
  )
  per_group <- do.call(rbind, lapply(levels(response), function(group) {
    test <- !train & response == group
    data.frame(
      cluster = group, train_n = sum(train & response == group), test_n = sum(test),
      recall = if (any(test)) mean(predicted[test] == response[test]) else NA_real_
    )
  }))
  metrics <- data.frame(
    split = c("Training families", "Held-out families"),
    n = c(sum(train), sum(!train)),
    fidelity = c(mean(predicted[train] == response[train]), mean(predicted[!train] == response[!train])),
    majority_baseline = c(mean(response[train] == baseline), mean(response[!train] == baseline))
  )
  list(tree = tree, predictions = predictions, probabilities = probabilities,
       metrics = metrics, per_group = per_group, train = train)
}

# A compact, inspectable layout for the actual fitted rpart tree. Only primary
# splits are present (maxsurrogate = 0), so each displayed path is unambiguous.
surrogate_tree_layout <- function(tree) {
  frame <- tree$frame
  ids <- as.integer(rownames(frame))
  leaves <- ids[frame$var == "<leaf>"]
  positions <- stats::setNames(rep(NA_real_, length(ids)), ids)
  positions[as.character(leaves)] <- seq_along(leaves)
  for (id in rev(ids[frame$var != "<leaf>"])) {
    positions[as.character(id)] <- mean(positions[as.character(c(2L * id, 2L * id + 1L))])
  }
  classes <- attr(tree, "ylevels")
  nodes <- data.frame(
    id = ids, x = unname(positions), y = -floor(log2(ids)),
    leaf = frame$var == "<leaf>", n = frame$n,
    predicted = classes[frame$yval], label = as.character(frame$var)
  )
  nodes$label[nodes$leaf] <- paste0(nodes$predicted[nodes$leaf], "\nn = ", nodes$n[nodes$leaf])
  nodes$label[!nodes$leaf] <- gsub("_", " ", nodes$label[!nodes$leaf])
  edges <- data.frame()
  rules <- character(nrow(frame))
  rules[1] <- "All assigned Pokémon"
  split_row <- 1L
  for (i in which(!nodes$leaf)) {
    split <- tree$splits[split_row, ]
    variable <- frame$var[i]
    if (abs(split[["ncat"]]) == 1) {
      cut <- format(signif(split[["index"]], 4), trim = TRUE)
      left <- paste(if (split[["ncat"]] < 0) "<" else ">=", cut)
      right <- paste(if (split[["ncat"]] < 0) ">=" else "<", cut)
    } else {
      levels <- attr(tree, "xlevels")[[variable]]
      codes <- tree$csplit[split[["index"]], seq_along(levels)]
      left <- paste(levels[codes == 1], collapse = ", ")
      right <- paste(levels[codes == 3], collapse = ", ")
    }
    for (side in 0:1) {
      child <- match(2L * nodes$id[i] + side, nodes$id)
      condition <- c(left, right)[side + 1L]
      edges <- rbind(edges, data.frame(
        parent = nodes$id[i], child = nodes$id[child],
        x = nodes$x[i], y = nodes$y[i], xend = nodes$x[child], yend = nodes$y[child],
        label = condition
      ))
      rule <- paste(gsub("_", " ", variable), condition)
      rules[child] <- if (i == 1L) rule else paste(rules[i], rule, sep = "; ")
    }
    split_row <- split_row + 1L + frame$ncompete[i] + frame$nsurrogate[i]
  }
  nodes$rule <- rules
  list(nodes = nodes, edges = edges)
}
