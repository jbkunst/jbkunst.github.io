<script>
(() => {
  "use strict";

  const root = document.querySelector("[data-story]");
  if (!root) return;
  let mathTypesetQueue = Promise.resolve();

  Promise.all([
    fetch(root.dataset.source).then(readJson),
    fetch(root.dataset.scenes).then(readJson)
  ])
    .then(([payload, config]) => startStory(payload, config))
    .catch((error) => showError(`No fue posible cargar la historia: ${error.message}`));

  function readJson(response) {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }

  function showError(message) {
    root.innerHTML = "";
    root.appendChild(htmlElement("p", "story-error", message));
  }

  function htmlElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function svgElement(tag, attributes = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    return node;
  }

  function startStory(payload, config) {
    const dataConfig = config.data;
    const sourceRows = payload[dataConfig.rowsKey];
    if (!Array.isArray(sourceRows) || sourceRows.length === 0) {
      throw new Error(`La clave ${dataConfig.rowsKey} no contiene observaciones`);
    }
    if (!Array.isArray(config.scenes) || config.scenes.length === 0) {
      throw new Error("La configuración no contiene escenas");
    }

    const rows = sourceRows.map((row, index) => ({
      ...row,
      index,
      timestamp: new Date(`${row[dataConfig.dateKey]}T00:00:00`).getTime()
    }));
    (dataConfig.derived || []).forEach((definition) => {
      if (!["changePercent", "logChangePercent"].includes(definition.operation)) {
        throw new Error(`Operación derivada no soportada: ${definition.operation}`);
      }
      rows.forEach((row, index) => {
        const current = Number(row[definition.source]);
        const previous = Number(rows[index - 1]?.[definition.source]);
        const hasPair = index > 0 && Number.isFinite(current) && Number.isFinite(previous);
        if (!hasPair || (definition.operation === "changePercent" && previous === 0)) {
          row[definition.key] = null;
        } else if (definition.operation === "changePercent") {
          row[definition.key] = 100 * (current / previous - 1);
        } else {
          row[definition.key] = 100 * (Math.exp(current - previous) - 1);
        }
      });
    });
    const scenes = config.scenes;
    const colours = config.colours;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ui = buildInterface(config);

    root.setAttribute("aria-label", config.ariaLabel);

    const plot = {
      width: 0,
      height: 0,
      margin: {},
      x: null,
      scales: {}
    };
    const layers = {
      grid: svgElement("g", {class: "story-grid"}),
      connectors: svgElement("g", {class: "story-connectors"}),
      lines: svgElement("g", {class: "story-lines"}),
      strips: svgElement("g", {class: "story-strips"}),
      events: svgElement("g", {class: "story-events"}),
      axes: svgElement("g", {class: "story-axes"})
    };
    ui.graphic.append(
      layers.grid,
      layers.connectors,
      layers.lines,
      layers.strips,
      layers.events,
      layers.axes
    );

    const pathNodes = new Map();
    const lineStates = new Map();
    const legendSets = new Map();
    let activeScene = 0;
    let renderedScene = 0;
    let animationFrame = null;
    let playing = false;
    let playTimer = null;
    let scrollFrame = null;
    let programmaticScrollTarget = null;
    let programmaticScrollTimer = null;
    let initialRevealDone = false;

    const progressButtons = scenes.map((scene, index) => {
      const button = htmlElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Ir a la escena ${index + 1}: ${scene.title}`);
      button.addEventListener("click", () => {
        setPlaying(false);
        goToScene(index);
      });
      ui.progress.appendChild(button);
      return button;
    });

    function colour(value) {
      return colours[value] || value;
    }

    function numericExtent(keys) {
      let minimum = Infinity;
      let maximum = -Infinity;
      keys.forEach((key) => rows.forEach((row) => {
        const value = Number(row[key]);
        if (!Number.isFinite(value)) return;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }));
      return [minimum, maximum];
    }

    function paddedDomain([minimum, maximum], proportion = 0.07) {
      const span = maximum - minimum || 1;
      return [minimum - span * proportion, maximum + span * proportion];
    }

    function niceTicks([minimum, maximum], count) {
      const span = maximum - minimum;
      if (!Number.isFinite(span) || span <= 0) return [minimum];
      const roughStep = span / Math.max(1, count);
      const power = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const error = roughStep / power;
      const factor = error >= Math.sqrt(50)
        ? 10
        : error >= Math.sqrt(10)
          ? 5
          : error >= Math.sqrt(2)
            ? 2
            : 1;
      const step = factor * power;
      const first = Math.ceil(minimum / step) * step;
      const last = Math.floor(maximum / step) * step;
      const ticks = [];
      for (let value = first; value <= last + step * 1e-9; value += step) {
        ticks.push(Math.abs(value) < step * 1e-9 ? 0 : value);
      }
      return ticks.length >= 2 ? ticks : [minimum, maximum];
    }

    function formatTick(value, definition) {
      if (definition.format === "number") {
        return Math.round(value).toLocaleString(dataConfig.locale);
      }
      const decimals = definition.decimals ?? 2;
      return value.toLocaleString(dataConfig.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    }

    function linearScale([domainStart, domainEnd], [rangeStart, rangeEnd]) {
      const domainSpan = domainEnd - domainStart || 1;
      return (value) => rangeStart + (
        (value - domainStart) / domainSpan
      ) * (rangeEnd - rangeStart);
    }

    function ease(value) {
      return value < 0.5
        ? 4 * value * value * value
        : 1 - Math.pow(-2 * value + 2, 3) / 2;
    }

    function rgbChannels(value) {
      const match = String(value).match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
      if (!match) return null;
      return match.slice(1).map((channel) => Number.parseInt(channel, 16));
    }

    function interpolateColour(from, to, progress) {
      if (from === to || progress <= 0) return from;
      if (progress >= 1) return to;
      const fromChannels = rgbChannels(from);
      const toChannels = rgbChannels(to);
      if (!fromChannels || !toChannels) return progress < 0.5 ? from : to;
      const channels = fromChannels.map((channel, index) => (
        Math.round(channel + (toChannels[index] - channel) * progress)
      ));
      return `rgb(${channels.join(", ")})`;
    }

    function dashValues(value) {
      if (!value || value === "none") return [Math.max(1000, plot.width * 2), 0];
      const values = String(value).trim().split(/[ ,]+/).map(Number);
      if (values.some((entry) => !Number.isFinite(entry))) return null;
      return [values[0], values[1] ?? values[0]];
    }

    function interpolateDash(from, to, progress) {
      const fromDash = from || "none";
      const toDash = to || "none";
      if (fromDash === toDash || progress <= 0) return fromDash;
      if (progress >= 1) return toDash;
      const fromValues = dashValues(fromDash);
      const toValues = dashValues(toDash);
      if (!fromValues || !toValues) return progress < 0.5 ? fromDash : toDash;
      return fromValues.map((value, index) => (
        value + (toValues[index] - value) * progress
      )).join(" ");
    }

    function resize() {
      const bounds = ui.graphic.getBoundingClientRect();
      plot.width = Math.max(320, bounds.width);
      plot.height = Math.max(480, bounds.height);
      plot.margin = {
        left: plot.width < 760 ? 22 : 54,
        right: plot.width < 760 ? 50 : 80,
        top: plot.width < 760 ? 124 : 96,
        bottom: plot.width < 760 ? 116 : 104
      };
      ui.graphic.setAttribute("viewBox", `0 0 ${plot.width} ${plot.height}`);

      const xDomain = [rows[0].timestamp, rows[rows.length - 1].timestamp];
      const yRange = [plot.height - plot.margin.bottom, plot.margin.top];
      plot.x = linearScale(xDomain, [plot.margin.left, plot.width - plot.margin.right]);
      plot.scales = Object.fromEntries(
        Object.entries(config.scales).map(([name, definition]) => [
          name,
          linearScale(paddedDomain(numericExtent(definition.keys)), yRange)
        ])
      );

      drawAxes(scenes[activeScene]);
      renderLines(scenes[activeScene], scenes[activeScene], 1);
      prepareOverlays(scenes[activeScene], scenes[activeScene])(1);
    }

    function yScale(scene) {
      return plot.scales[scene.scale];
    }

    function lineCoordinates(line, scene) {
      const scale = yScale(scene);
      return rows.map((row) => ({
        x: plot.x(row.timestamp),
        y: scale(Number(row[line.key])),
        defined: Number.isFinite(Number(row[line.key]))
      }));
    }

    function pathData(points) {
      let path = "";
      let drawing = false;
      points.forEach((point) => {
        if (!point.defined) {
          drawing = false;
          return;
        }
        path += `${drawing ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
        drawing = true;
      });
      return path;
    }

    function interpolatePoints(from, to, progress) {
      return to.map((point, index) => {
        const origin = from[index] || point;
        return {
          x: origin.x + (point.x - origin.x) * progress,
          y: origin.y + (point.y - origin.y) * progress,
          defined: origin.defined && point.defined
        };
      });
    }

    function lineMap(scene) {
      return new Map(scene.lines.map((line) => [line.id, line]));
    }

    function renderLines(fromScene, toScene, progress, frozenStates = null) {
      const fromLines = lineMap(fromScene);
      const toLines = lineMap(toScene);
      const ids = new Set([
        ...(frozenStates ? frozenStates.keys() : fromLines.keys()),
        ...toLines.keys()
      ]);

      ids.forEach((id) => {
        const fromLine = fromLines.get(id);
        const toLine = toLines.get(id);
        const frozenState = frozenStates?.get(id);
        const source = fromLine || toLine;
        const target = toLine || fromLine;
        let path = pathNodes.get(id);
        if (!path) {
          path = svgElement("path", {
            fill: "none",
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
          });
          layers.lines.appendChild(path);
          pathNodes.set(id, path);
        }

        const sourcePoints = frozenState?.points || lineCoordinates(
          source,
          fromLine ? fromScene : toScene
        );
        const targetPoints = toLine ? lineCoordinates(toLine, toScene) : sourcePoints;
        const points = toLine
          ? interpolatePoints(sourcePoints, targetPoints, progress)
          : sourcePoints;
        const sourceOpacity = frozenState?.opacity ?? (
          fromLine ? (fromLine.opacity ?? 1) : 0
        );
        const targetOpacity = toLine ? (toLine.opacity ?? 1) : 0;
        const opacity = sourceOpacity + (targetOpacity - sourceOpacity) * progress;
        const sourceColour = frozenState?.colour || colour(source.colour);
        const targetColour = toLine ? colour(toLine.colour) : sourceColour;
        const stroke = toLine
          ? interpolateColour(sourceColour, targetColour, progress)
          : targetColour;
        const sourceWidth = frozenState?.width ?? (source?.width ?? 2);
        const targetWidth = toLine ? (toLine.width ?? 2) : sourceWidth;
        const width = toLine
          ? sourceWidth + (targetWidth - sourceWidth) * progress
          : targetWidth;
        const sourceDash = frozenState?.dash || source?.dash;
        const dash = toLine
          ? interpolateDash(sourceDash, toLine.dash, progress)
          : (sourceDash || "none");

        path.setAttribute("d", pathData(points));
        path.setAttribute("stroke", stroke);
        path.setAttribute("stroke-width", width);
        path.setAttribute("stroke-dasharray", dash);
        path.setAttribute("opacity", opacity);
        lineStates.set(id, {points, opacity, colour: stroke, width, dash});

        if (!toLine && progress === 1) {
          path.remove();
          pathNodes.delete(id);
          lineStates.delete(id);
        }
      });
    }

    function clear(node) {
      node.replaceChildren();
    }

    function drawAxes(scene) {
      clear(layers.grid);
      clear(layers.axes);
      const scale = yScale(scene);
      const scaleDefinition = config.scales[scene.scale];
      const domain = paddedDomain(numericExtent(scaleDefinition.keys));
      const tickCount = plot.height < 620 ? 4 : 6;
      const yTicks = niceTicks(domain, tickCount);
      const axisTextRight = plot.width - (plot.width < 760 ? 16 : 32);

      yTicks.forEach((value) => {
        const y = scale(value);
        layers.grid.appendChild(svgElement("line", {
          x1: plot.margin.left,
          x2: plot.width - plot.margin.right,
          y1: y,
          y2: y,
          stroke: colours.grid
        }));
        const label = svgElement("text", {
          x: axisTextRight,
          y: y + 4,
          fill: colours.axis,
          "font-family": "IBM Plex Sans, sans-serif",
          "font-size": plot.width < 760 ? 10 : 11,
          "text-anchor": "end"
        });
        label.textContent = formatTick(value, scaleDefinition);
        layers.axes.appendChild(label);
      });

      const xAxisY = plot.height - plot.margin.bottom;
      layers.axes.appendChild(svgElement("line", {
        x1: plot.margin.left,
        x2: plot.width - plot.margin.right,
        y1: xAxisY,
        y2: xAxisY,
        stroke: "rgba(218, 229, 238, 0.22)"
      }));
      const xTickCount = plot.width < 760 ? 4 : 7;
      const usedIndices = new Set();
      for (let tick = 0; tick < xTickCount; tick += 1) {
        const index = Math.round(tick * (rows.length - 1) / (xTickCount - 1));
        if (usedIndices.has(index)) continue;
        usedIndices.add(index);
        const row = rows[index];
        const label = svgElement("text", {
          x: plot.x(row.timestamp),
          y: xAxisY + 24,
          fill: colours.axis,
          "font-family": "IBM Plex Sans, sans-serif",
          "font-size": plot.width < 760 ? 10 : 11,
          "text-anchor": tick === 0 ? "start" : tick === xTickCount - 1 ? "end" : "middle"
        });
        label.textContent = String(row[dataConfig.periodLabelKey]).slice(0, 4);
        layers.axes.appendChild(label);
      }

      const axisTitle = svgElement("text", {
        x: axisTextRight,
        y: plot.margin.top - 16,
        fill: colours.axis,
        stroke: "#071521",
        "stroke-width": 4,
        "paint-order": "stroke",
        "font-family": "IBM Plex Sans, sans-serif",
        "font-size": 11,
        "text-anchor": "end"
      });
      axisTitle.textContent = scene.axisLabel;
      layers.axes.appendChild(axisTitle);
    }

    function clearOverlays() {
      clear(layers.connectors);
      clear(layers.strips);
      clear(layers.events);
    }

    function prepareOverlays(fromScene, toScene) {
      clearOverlays();
      const opacityUpdates = [];

      const addLayerTransition = ({layer, fromAvailable, toAvailable, same, drawFrom, drawTo}) => {
        if (fromScene === toScene || same) {
          if (toAvailable) drawTo(layer);
          return;
        }

        let fromGroup = null;
        let toGroup = null;
        if (fromAvailable) {
          fromGroup = svgElement("g", {opacity: 1});
          layer.appendChild(fromGroup);
          drawFrom(fromGroup);
        }
        if (toAvailable) {
          toGroup = svgElement("g", {opacity: 0});
          layer.appendChild(toGroup);
          drawTo(toGroup);
        }
        opacityUpdates.push((progress) => {
          if (fromGroup) fromGroup.setAttribute("opacity", 1 - progress);
          if (toGroup) toGroup.setAttribute("opacity", progress);
        });
      };

      addLayerTransition({
        layer: layers.connectors,
        fromAvailable: Boolean(fromScene.connector),
        toAvailable: Boolean(toScene.connector),
        same: Boolean(fromScene.connector && fromScene.connector === toScene.connector),
        drawFrom: (target) => drawConnectors(fromScene, 1, target),
        drawTo: (target) => drawConnectors(toScene, 1, target)
      });

      addLayerTransition({
        layer: layers.strips,
        fromAvailable: Boolean(fromScene.strips || fromScene.innovationSeries),
        toAvailable: Boolean(toScene.strips || toScene.innovationSeries),
        same: false,
        drawFrom: (target) => drawStrips(fromScene, 1, target),
        drawTo: (target) => drawStrips(toScene, 1, target, true)
      });
      prepareStripLabels(fromScene, toScene, opacityUpdates);

      addLayerTransition({
        layer: layers.events,
        fromAvailable: Boolean(fromScene.eventSeries),
        toAvailable: Boolean(toScene.eventSeries),
        same: Boolean(fromScene.eventSeries && fromScene.eventSeries === toScene.eventSeries),
        drawFrom: (target) => drawEvents(fromScene, 1, target),
        drawTo: (target) => drawEvents(toScene, 1, target)
      });

      return (progress) => opacityUpdates.forEach((update) => update(progress));
    }

    function stripDefinitions(scene) {
      return scene.strips || [{
        key: scene.innovationSeries,
        label: scene.innovationLabel,
        labelTex: scene.innovationLabelTex,
        colour: "innovation",
        type: "bars"
      }];
    }

    function prepareStripLabels(fromScene, toScene, opacityUpdates) {
      clear(ui.stripLabels);
      const fromHasStrips = Boolean(fromScene.strips || fromScene.innovationSeries);
      const toHasStrips = Boolean(toScene.strips || toScene.innovationSeries);

      if (fromScene === toScene) {
        if (toHasStrips) renderStripLabels(toScene, ui.stripLabels);
        return;
      }

      let fromSet = null;
      let toSet = null;
      if (fromHasStrips) {
        fromSet = htmlElement("div", "story-strip-label-set");
        fromSet.style.opacity = "1";
        ui.stripLabels.appendChild(fromSet);
        renderStripLabels(fromScene, fromSet);
      }
      if (toHasStrips) {
        toSet = htmlElement("div", "story-strip-label-set");
        toSet.style.opacity = "0";
        ui.stripLabels.appendChild(toSet);
        renderStripLabels(toScene, toSet);
      }
      opacityUpdates.push((progress) => {
        if (fromSet) fromSet.style.opacity = String(1 - progress);
        if (toSet) toSet.style.opacity = String(progress);
      });
    }

    function renderStripLabels(scene, targetLayer) {
      const definitions = stripDefinitions(scene);
      const xStart = plot.width < 760
        ? plot.margin.left
        : Math.max(plot.margin.left, plot.width * 0.54);
      const xEnd = plot.width - plot.margin.right;
      const stripHeightTarget = scene.stripHeight || 70;
      const availableHeight = Math.min(240, definitions.length * stripHeightTarget);
      const areaTop = plot.width < 760
        ? plot.margin.top + 28
        : plot.height - plot.margin.bottom - 18 - availableHeight;
      const stripHeight = availableHeight / definitions.length;

      definitions.forEach((definition, index) => {
        const label = htmlElement("div", "story-strip-label");
        let math = null;
        label.style.setProperty("--strip-colour", colour(definition.colour || "innovation"));
        label.style.left = `${xStart + 10}px`;
        label.style.top = `${areaTop + index * stripHeight + 5}px`;
        label.style.width = `${Math.max(80, xEnd - xStart - 20)}px`;
        label.style.opacity = String(definition.opacity ?? 1);
        if (definition.labelTex) {
          math = htmlElement("span", "story-strip-math");
          label.appendChild(math);
          if (definition.label) {
            label.appendChild(document.createTextNode(` · ${definition.label}`));
          }
        } else {
          label.textContent = definition.label;
        }
        targetLayer.appendChild(label);
        if (math) renderInlineMath(math, definition.labelTex);
      });
    }

    function drawConnectors(scene, opacity, targetLayer = layers.connectors) {
      const definition = config.connectors[scene.connector];
      if (!definition) return;
      rows.forEach((row) => {
        const from = Number(row[definition.from]);
        const to = Number(row[definition.to]);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return;
        if (Math.abs(to - from) <= definition.threshold) return;
        targetLayer.appendChild(svgElement("line", {
          x1: plot.x(row.timestamp),
          x2: plot.x(row.timestamp),
          y1: yScale(scene)(from),
          y2: yScale(scene)(to),
          stroke: colour(definition.colour),
          "stroke-width": 1,
          opacity: 0.32 * opacity
        }));
      });
    }

    function drawStrips(
      scene,
      opacity,
      targetLayer = layers.strips,
      animateFromReference = false
    ) {
      const definitions = stripDefinitions(scene);
      const xStart = plot.width < 760
        ? plot.margin.left
        : Math.max(plot.margin.left, plot.width * 0.54);
      const xEnd = plot.width - plot.margin.right;
      const stripHeightTarget = scene.stripHeight || 70;
      const availableHeight = Math.min(240, definitions.length * stripHeightTarget);
      const areaTop = plot.width < 760
        ? plot.margin.top + 28
        : plot.height - plot.margin.bottom - 18 - availableHeight;
      const stripHeight = availableHeight / definitions.length;
      const stripX = linearScale(
        [rows[0].timestamp, rows[rows.length - 1].timestamp],
        [xStart + 8, xEnd - 8]
      );
      const pendingAnimations = [];

      definitions.forEach((definition, index) => {
        const seriesKeys = [definition.key, definition.referenceKey].filter(Boolean);
        const values = seriesKeys.flatMap((key) => rows
          .map((row) => Number(row[key]))
          .filter(Number.isFinite)
        );
        if (values.length === 0) return;

        const minimum = Math.min(...values);
        const maximumValue = Math.max(...values);
        const maximum = Math.max(...values.map(Math.abs), 1e-8);
        const top = areaTop + index * stripHeight;
        const baseline = top + stripHeight * 0.57;
        const amplitude = stripHeight * 0.28;
        const stripColour = colour(definition.colour || "innovation");
        const extentPadding = Math.max((maximumValue - minimum) * 0.08, 1e-8);
        const extentScale = definition.scale === "extent"
          ? linearScale(
            [minimum - extentPadding, maximumValue + extentPadding],
            [top + stripHeight - 10, top + 24]
          )
          : null;

        targetLayer.appendChild(svgElement("rect", {
          x: xStart,
          y: top + 2,
          width: xEnd - xStart,
          height: stripHeight - 5,
          rx: 8,
          fill: "rgba(4, 14, 23, 0.62)",
          stroke: "rgba(190, 216, 235, 0.09)",
          opacity
        }));
        const seriesLayer = svgElement("g", {
          opacity: definition.opacity ?? 1
        });
        targetLayer.appendChild(seriesLayer);
        if (!extentScale) {
          seriesLayer.appendChild(svgElement("line", {
            x1: xStart + 8,
            x2: xEnd - 8,
            y1: baseline,
            y2: baseline,
            stroke: stripColour,
            "stroke-opacity": 0.28 * opacity
          }));
        }

        const stripY = (value) => extentScale
          ? extentScale(value)
          : baseline - value / maximum * amplitude;
        const referenceColour = colour(definition.referenceColour || "observed");
        const effectColour = colour(definition.effectColour || "regression");
        const shouldAnimateReference = Boolean(
          animateFromReference && definition.referenceKey && !reducedMotion.matches
        );

        if (definition.referenceKey) {
          if (definition.type === "line") {
            const referencePoints = rows.map((row) => {
              const value = Number(row[definition.referenceKey]);
              return {
                x: stripX(row.timestamp),
                y: stripY(value),
                defined: Number.isFinite(value)
              };
            });
            seriesLayer.appendChild(svgElement("path", {
              d: pathData(referencePoints),
              fill: "none",
              stroke: referenceColour,
              "stroke-width": definition.referenceWidth || 1.25,
              "stroke-dasharray": "4 4",
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              opacity: 0.58 * opacity
            }));
          } else {
            rows.forEach((row) => {
              const value = Number(row[definition.referenceKey]);
              if (!Number.isFinite(value)) return;
              const x = stripX(row.timestamp);
              seriesLayer.appendChild(svgElement("line", {
                x1: x,
                x2: x,
                y1: baseline,
                y2: stripY(value),
                stroke: referenceColour,
                "stroke-width": Math.max(1, (xEnd - xStart) / rows.length * 0.32),
                opacity: 0.52 * opacity
              }));
            });
          }

          rows.forEach((row) => {
            const from = Number(row[definition.referenceKey]);
            const to = Number(row[definition.key]);
            if (!Number.isFinite(from) || !Number.isFinite(to)) return;
            if (Math.abs(to - from) < (definition.threshold || 0)) return;
            const x = stripX(row.timestamp);
            seriesLayer.appendChild(svgElement("line", {
              x1: x,
              x2: x,
              y1: stripY(from),
              y2: stripY(to),
              stroke: effectColour,
              "stroke-width": definition.effectWidth || 1.4,
              opacity: 0.72 * opacity
            }));
          });
        }

        if (definition.type === "line") {
          const points = rows.map((row) => {
            const value = Number(row[definition.key]);
            return {
              x: stripX(row.timestamp),
              y: stripY(value),
              defined: Number.isFinite(value)
            };
          });
          const path = svgElement("path", {
            d: pathData(points),
            fill: "none",
            stroke: stripColour,
            "stroke-width": definition.width || 1.6,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            opacity: 0.82 * opacity
          });
          if (shouldAnimateReference) {
            const referencePoints = rows.map((row) => {
              const value = Number(row[definition.referenceKey]);
              return {
                x: stripX(row.timestamp),
                y: stripY(value),
                defined: Number.isFinite(value)
              };
            });
            const animation = svgElement("animate", {
              attributeName: "d",
              from: pathData(referencePoints),
              to: pathData(points),
              dur: `${config.transitionDuration}ms`,
              begin: "indefinite",
              fill: "freeze",
              calcMode: "spline",
              keyTimes: "0;1",
              keySplines: ".22 .72 .25 1"
            });
            path.appendChild(animation);
            pendingAnimations.push(animation);
          }
          seriesLayer.appendChild(path);
        } else {
          rows.forEach((row) => {
            const value = Number(row[definition.key]);
            if (!Number.isFinite(value)) return;
            const x = stripX(row.timestamp);
            const y = stripY(value);
            const bar = svgElement("line", {
              x1: x,
              x2: x,
              y1: baseline,
              y2: y,
              stroke: stripColour,
              "stroke-width": Math.max(1, (xEnd - xStart) / rows.length * 0.55),
              opacity: 0.76 * opacity
            });
            if (shouldAnimateReference) {
              const referenceValue = Number(row[definition.referenceKey]);
              if (Number.isFinite(referenceValue)) {
                const animation = svgElement("animate", {
                  attributeName: "y2",
                  from: stripY(referenceValue),
                  to: y,
                  dur: `${config.transitionDuration}ms`,
                  begin: "indefinite",
                  fill: "freeze",
                  calcMode: "spline",
                  keyTimes: "0;1",
                  keySplines: ".22 .72 .25 1"
                });
                bar.appendChild(animation);
                pendingAnimations.push(animation);
              }
            }
            seriesLayer.appendChild(bar);
          });
        }

      });
      if (pendingAnimations.length > 0) {
        requestAnimationFrame(() => pendingAnimations.forEach((animation) => {
          animation.beginElement?.();
        }));
      }
    }

    function drawEvents(scene, opacity, targetLayer = layers.events) {
      rows.filter((row) => row[dataConfig.eventKey]).forEach((row) => {
        const x = plot.x(row.timestamp);
        const y = yScale(scene)(Number(row[scene.eventSeries]));
        const group = svgElement("g", {
          transform: `translate(${x},${y})`,
          opacity
        });
        group.appendChild(svgElement("circle", {
          r: 4.5,
          fill: colour("regression"),
          stroke: "#071521",
          "stroke-width": 1.5
        }));

        if (plot.width >= 760) {
          const event = row[dataConfig.eventKey];
          const offset = config.eventOffsets[event] || [28, -50];
          group.appendChild(svgElement("path", {
            d: `M0,0 L${offset[0] * 0.55},${offset[1]} L${offset[0]},${offset[1]}`,
            fill: "none",
            stroke: colour("regression"),
            "stroke-width": 1.2
          }));
          const label = svgElement("text", {
            x: offset[0],
            y: offset[1] - 7,
            fill: colour("regression"),
            stroke: "#071521",
            "stroke-width": 5,
            "stroke-linejoin": "round",
            "paint-order": "stroke",
            "font-family": "IBM Plex Sans, sans-serif",
            "font-size": 12,
            "font-weight": 600,
            "text-anchor": offset[0] < 0 ? "end" : "start"
          });
          label.textContent = event;
          group.appendChild(label);
        }
        targetLayer.appendChild(group);
      });
    }

    function renderLegend(scene) {
      let legendSet = legendSets.get(scene.id);
      if (!legendSet) {
        legendSet = htmlElement("div", "story-legend-set");
        legendSet.dataset.legend = scene.id;
        legendSet.append(...scene.legend.map((entry) => {
          const item = htmlElement("span");
          const swatch = htmlElement("i");
          const label = htmlElement("span", "story-legend-label");
          swatch.style.setProperty("--legend-colour", colour(entry.colour));
          if (entry.labelTex) {
            const math = htmlElement("span", "story-legend-math");
            math.textContent = `\\(${entry.labelTex}\\)`;
            label.appendChild(math);
            if (entry.label) label.appendChild(document.createTextNode(`: ${entry.label}`));
          } else {
            label.textContent = entry.label;
          }
          item.append(swatch, label);
          return item;
        }));
        legendSets.set(scene.id, legendSet);
        ui.legend.appendChild(legendSet);
        typesetMath(legendSet);
      }
      legendSets.forEach((set, id) => {
        set.hidden = id !== scene.id;
      });
    }

    function transitionTo(index, immediate = false, previousScene = scenes[renderedScene]) {
      const fromScene = previousScene;
      const toScene = scenes[index];
      if (!toScene || !plot.width) return;
      const frozenStates = new Map(lineStates);
      if (animationFrame) cancelAnimationFrame(animationFrame);

      drawAxes(toScene);
      renderLegend(toScene);
      let updateOverlays = prepareOverlays(fromScene, toScene);
      updateOverlays(immediate ? 1 : 0);

      if (immediate || reducedMotion.matches || fromScene === toScene) {
        renderLines(toScene, toScene, 1);
        updateOverlays = prepareOverlays(toScene, toScene);
        updateOverlays(1);
        renderedScene = index;
        return;
      }

      const startedAt = performance.now();
      const animate = (now) => {
        const rawProgress = Math.min(1, (now - startedAt) / config.transitionDuration);
        const progress = ease(rawProgress);
        renderLines(fromScene, toScene, progress, frozenStates);
        updateOverlays(progress);
        if (rawProgress < 1) {
          animationFrame = requestAnimationFrame(animate);
        } else {
          animationFrame = null;
          renderedScene = index;
        }
      };
      animationFrame = requestAnimationFrame(animate);
    }

    function activateScene(index, immediate = false) {
      if (index === activeScene && !immediate) return;
      const previousScene = scenes[activeScene];
      const sceneDefinition = scenes[index];
      activeScene = index;
      ui.scenes.forEach((scene, sceneIndex) => {
        scene.classList.toggle("is-active", sceneIndex === index);
        if (sceneIndex === index) scene.setAttribute("aria-current", "step");
        else scene.removeAttribute("aria-current");
      });
      progressButtons.forEach((button, buttonIndex) => {
        if (buttonIndex === index) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      });
      if (ui.counter) ui.counter.textContent = `${index + 1} / ${scenes.length}`;
      ui.announcer.textContent = `${toSceneLabel(sceneDefinition)}. ${sceneDefinition.title}`;
      ui.graphicDescription.textContent = sceneDefinition.graphicDescription || (
        `${sceneDefinition.title}. ${sceneDefinition.legend.map((entry) => entry.label).join(", ")}.`
      );
      ui.previous.disabled = index === 0;
      ui.next.disabled = index === scenes.length - 1;
      transitionTo(index, immediate, previousScene);
    }

    function goToScene(index) {
      const boundedIndex = Math.max(0, Math.min(scenes.length - 1, index));
      if (!reducedMotion.matches) {
        programmaticScrollTarget = boundedIndex;
        clearTimeout(programmaticScrollTimer);
        programmaticScrollTimer = window.setTimeout(
          cancelProgrammaticScroll,
          Math.max(1800, config.transitionDuration + 600)
        );
      }
      activateScene(boundedIndex);
      ui.scenes[boundedIndex].scrollIntoView({
        behavior: reducedMotion.matches ? "auto" : "smooth",
        block: "center"
      });
    }

    function cancelProgrammaticScroll() {
      programmaticScrollTarget = null;
      clearTimeout(programmaticScrollTimer);
      programmaticScrollTimer = null;
    }

    function setPlaying(value) {
      playing = value && !reducedMotion.matches;
      if (ui.play) {
        ui.play.textContent = playing ? "Pausa" : "Reproducir";
        ui.play.setAttribute(
          "aria-label",
          playing ? "Pausar animación" : "Reproducir animación"
        );
        ui.play.setAttribute("aria-pressed", String(playing));
      }
      clearTimeout(playTimer);
      if (playing) scheduleNext();
    }

    function scheduleNext() {
      clearTimeout(playTimer);
      if (!playing) return;
      if (activeScene >= scenes.length - 1) {
        setPlaying(false);
        return;
      }
      playTimer = window.setTimeout(() => {
        goToScene(activeScene + 1);
        scheduleNext();
      }, config.sceneDuration);
    }

    function updateFromScroll() {
      scrollFrame = null;
      const viewportCenter = window.innerHeight * 0.5;
      if (programmaticScrollTarget !== null) {
        const targetBounds = ui.scenes[programmaticScrollTarget].getBoundingClientRect();
        const targetDistance = Math.abs(
          targetBounds.top + targetBounds.height * 0.5 - viewportCenter
        );
        if (targetDistance > Math.max(8, window.innerHeight * 0.06)) return;
        cancelProgrammaticScroll();
      }
      let closestIndex = activeScene;
      let closestDistance = Infinity;
      ui.scenes.forEach((scene, index) => {
        const bounds = scene.getBoundingClientRect();
        const distance = Math.abs(bounds.top + bounds.height * 0.5 - viewportCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      activateScene(closestIndex);
    }

    function revealInitialLine() {
      if (initialRevealDone || reducedMotion.matches || activeScene !== 0) return;
      const path = pathNodes.get("observed");
      if (!path) return;
      initialRevealDone = true;
      const length = path.getTotalLength();
      path.style.transition = "none";
      path.setAttribute("stroke-dasharray", `${length} ${length}`);
      path.setAttribute("stroke-dashoffset", length);
      path.getBoundingClientRect();
      path.style.transition = "stroke-dashoffset 1900ms cubic-bezier(.22,.72,.25,1)";
      path.setAttribute("stroke-dashoffset", 0);
      window.setTimeout(() => {
        path.style.transition = "";
        path.setAttribute("stroke-dasharray", "none");
      }, 1950);
    }

    window.addEventListener("scroll", () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateFromScroll);
    }, {passive: true});
    window.addEventListener("wheel", () => {
      cancelProgrammaticScroll();
      setPlaying(false);
    }, {passive: true});
    window.addEventListener("touchstart", () => {
      cancelProgrammaticScroll();
      setPlaying(false);
    }, {passive: true});
    ui.previous.addEventListener("click", () => {
      setPlaying(false);
      goToScene(activeScene - 1);
    });
    ui.next.addEventListener("click", () => {
      setPlaying(false);
      goToScene(activeScene + 1);
    });
    ui.play?.addEventListener("click", () => setPlaying(!playing));

    document.addEventListener("keydown", (event) => {
      const bounds = root.getBoundingClientRect();
      if (!(bounds.top < window.innerHeight && bounds.bottom > 0)) return;
      const interactiveTarget = event.target.closest?.("a, button, input, select, textarea");
      if (interactiveTarget && (event.key === " " || event.key === "Enter")) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setPlaying(false);
        goToScene(activeScene + 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setPlaying(false);
        goToScene(activeScene - 1);
      } else if (event.key === " " && ui.play) {
        event.preventDefault();
        setPlaying(!playing);
      }
    });

    reducedMotion.addEventListener("change", (event) => {
      if (event.matches) setPlaying(false);
      transitionTo(activeScene, true);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) setPlaying(false);
    });

    new ResizeObserver(resize).observe(ui.graphic);
    resize();
    activateScene(0, true);
    updateFromScroll();
    requestAnimationFrame(revealInitialLine);
    typesetMath(root);
  }

  function buildInterface(config) {
    root.innerHTML = "";
    const scroll = htmlElement("div", "story-scroll");
    const stage = htmlElement("div", "story-stage");
    const graphic = svgElement("svg", {
      id: "story-graphic",
      role: "img",
      "aria-label": config.title
    });
    const graphicTitle = Object.assign(svgElement("title"), {textContent: config.title});
    const graphicDescription = Object.assign(svgElement("desc"), {
      textContent: "La serie se transforma al avanzar entre las escenas."
    });
    graphic.append(
      graphicTitle,
      graphicDescription
    );
    const brandLayer = htmlElement("div", "story-brand-layer");
    const brand = htmlElement("p", "story-brand", config.brand);
    brandLayer.appendChild(brand);
    const legend = htmlElement("div", "story-legend");
    legend.setAttribute("aria-label", "Leyenda");
    const stripLabels = htmlElement("div", "story-strip-labels");
    stripLabels.setAttribute("aria-label", "Componentes auxiliares");
    const siteLink = config.siteLink
      ? htmlElement("a", "story-site-link", config.siteLink.label)
      : null;
    if (siteLink) {
      siteLink.href = config.siteLink.href;
      siteLink.target = "_blank";
      siteLink.rel = "noopener noreferrer";
    }

    const controls = htmlElement("footer", "story-controls");
    controls.setAttribute("aria-label", "Controles de la historia");
    const controlOptions = config.controls || {};
    const previous = htmlElement("button", null, "←");
    previous.type = "button";
    previous.setAttribute("aria-label", "Escena anterior");
    const play = controlOptions.play === false
      ? null
      : htmlElement("button", null, "Reproducir");
    if (play) {
      play.type = "button";
      play.setAttribute("aria-label", "Reproducir animación");
      play.setAttribute("aria-pressed", "false");
    }
    const next = htmlElement("button", null, "→");
    next.type = "button";
    next.setAttribute("aria-label", "Escena siguiente");
    const progress = htmlElement("nav", "story-progress");
    progress.setAttribute("aria-label", "Escenas");
    const counter = controlOptions.counter === false
      ? null
      : htmlElement("p", "story-counter");
    if (counter) counter.setAttribute("aria-live", "polite");
    const announcer = htmlElement("p", "story-sr-only");
    announcer.setAttribute("aria-live", "polite");
    controls.appendChild(previous);
    if (play) controls.appendChild(play);
    controls.append(progress, next);
    if (counter) controls.appendChild(counter);
    stage.append(graphic, legend, stripLabels, controls);
    if (siteLink) stage.appendChild(siteLink);

    const sceneContainer = htmlElement("div", "story-scenes");
    const sceneNodes = config.scenes.map((scene, index) => {
      const section = htmlElement("section", "story-scene");
      section.dataset.scene = index;
      const kicker = htmlElement("p", "story-kicker", scene.kicker);
      const heading = htmlElement(index === 0 ? "h1" : "h2", null, scene.title);
      const description = htmlElement("p", "story-description");
      description.innerHTML = scene.descriptionHtml;
      const formula = htmlElement("div", "story-formula");
      if (scene.formulaCompact) formula.classList.add("is-compact");
      formula.textContent = `\\(${scene.formulaTex}\\)`;
      section.append(kicker, heading, description, formula);
      if (scene.downloads) {
        const downloads = htmlElement("p", "story-downloads");
        scene.downloads.forEach((download) => {
          const link = htmlElement("a", null, download.label);
          link.href = download.href;
          if (download.download) link.setAttribute("download", "");
          downloads.appendChild(link);
        });
        section.appendChild(downloads);
      }
      sceneContainer.appendChild(section);
      return section;
    });

    scroll.append(brandLayer, stage, sceneContainer);
    root.append(scroll, announcer);
    return {
      graphic,
      graphicDescription,
      legend,
      stripLabels,
      previous,
      play,
      next,
      progress,
      counter,
      announcer,
      scenes: sceneNodes
    };
  }

  function toSceneLabel(scene) {
    return scene.kicker.replace(/^(\d+)/, "Escena $1");
  }

  function typesetMath(container) {
    let attempts = 0;
    const render = () => {
      attempts += 1;
      if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
        mathTypesetQueue = mathTypesetQueue
          .catch(() => {})
          .then(() => window.MathJax.startup?.promise)
          .then(() => window.MathJax.typesetPromise([container]))
          .catch(() => {});
      } else if (attempts < 300) {
        window.setTimeout(render, 100);
      }
    };
    render();
  }

  function renderInlineMath(container, tex) {
    container.textContent = `\\(${tex}\\)`;
    let attempts = 0;
    const render = () => {
      attempts += 1;
      if (window.MathJax && typeof window.MathJax.typeset === "function") {
        try {
          window.MathJax.typeset([container]);
        } catch (error) {
          if (attempts < 300) window.setTimeout(render, 100);
        }
      } else if (attempts < 300) {
        window.setTimeout(render, 100);
      }
    };
    render();
  }
})();
</script>
