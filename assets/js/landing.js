<script>
(() => {
  const canvas = document.getElementById("data-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const label = document.getElementById("chart-name");
  const step = document.getElementById("chart-step");
  const action = document.getElementById("chart-action");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scenes = ["data", "patterns", "relationships", "models", "decision", "predictions", "validation"];
  const sceneCopy = [
    ["I explore", "data"],
    ["I find", "patterns"],
    ["I map", "relationships"],
    ["I build", "models"],
    ["I guide", "decisions"],
    ["I make", "predictions"],
    ["I assess", "performance"]
  ];
  const count = 110;
  const predictionCount = 24;
  const trainingExtent = .8;
  const points = Array.from({ length: count }, (_, i) => ({
    seed: i / (count - 1),
    noise: Math.sin(i * 91.73) * .52 + Math.cos(i * 17.31) * .48,
    phase: (i * 2.399) % (Math.PI * 2)
  }));
  const predictions = Array.from({ length: predictionCount }, (_, i) => ({
    seed: i / (predictionCount - 1),
    xNoise: ((Math.sin((i + 1) * 127.1) * 43758.5453) % 1 + 1) % 1 - .5,
    noise: ((Math.sin((i + 1) * 311.7) * 43758.5453) % 1 + 1) % 1 - .5
  }));
  const hubIndices = [22, 54, 86];
  const regularEdges = Array.from({ length: 30 }, (_, i) => {
    const from = (i * 7 + 3) % (count - 7);
    const distance = 1 + (i * 5) % 6;
    return { from, to: from + distance, hub: false };
  });
  const hubEdges = hubIndices.flatMap((from) => [-3, 2, 5].map((offset) => ({
    from,
    to: from + offset,
    hub: true
  })));
  const edges = [...regularEdges, ...hubEdges];

  let w, h, dpr;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth;
    h = innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function bounds() {
    const x0 = w * .54;
    const x1 = w * .96;
    return { x0, x1, span: x1 - x0, mid: h * .49 };
  }

  function curveValue(u) {
    const x = 50 * u;
    const truth = 20 + .5 * x + 12 * Math.sin(x / 5);
    return .71 - truth / 120;
  }

  function position(p, scene, now) {
    const { x0, span, mid } = bounds();

    if (scene === 0) {
      const angle = p.phase + now * .00011;
      const radius = (.1 + p.seed * .9) * Math.min(span * .48, h * .39);
      return [
        x0 + span * .54 + Math.cos(angle * 2.05) * radius,
        mid + Math.sin(angle * 1.72) * radius * .72
      ];
    }

    if (scene === 1 || scene === 2) {
      const orbit = now * .0011 + p.phase;
      return [
        x0 + p.seed * span + Math.cos(orbit) * 8,
        mid + (p.seed - .5) * -h * .38 + p.noise * h * .062 + Math.sin(orbit) * 12
      ];
    }

    const trainingSpan = span * trainingExtent;
    const u = p.seed;
    const drift = now * .001 + p.phase;
    const noiseScale = u < .32 ? .04 : .055;
    return [
      x0 + u * trainingSpan + Math.cos(drift) * 5,
      h * curveValue(u * trainingExtent) + p.noise * h * noiseScale + Math.sin(drift * 1.17) * 7
    ];
  }

  function ease(v) {
    return v < .5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
  }

  function sceneOpacity(index, current, next, mix) {
    if (current === index) return 1 - mix;
    if (next === index) return mix;
    return 0;
  }

  function drawCurve(kind, opacity, progress = 1, extent = 1, emphasis = false) {
    if (opacity <= 0 || progress <= 0) return;
    const { x0, span } = bounds();
    const visibleExtent = Math.min(1, progress) * extent;
    const segments = Math.max(1, Math.floor(140 * visibleExtent));
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const u = i / 140;
      let y = h * curveValue(u);
      if (kind === "first") {
        y += Math.sin(u * Math.PI * 6.4 + .5) * h * .03;
        y += Math.sin(u * Math.PI * 18.5) * h * .012;
      } else if (kind === "simple") {
        const start = curveValue(0);
        const end = curveValue(trainingExtent);
        const v = Math.min(1, u / trainingExtent);
        const broadCurve = .052 * Math.sin(v * Math.PI - .35);
        y = h * (start + (end - start) * v + broadCurve);
      }
      const x = x0 + u * span;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = kind === "final" ? (emphasis ? 5.5 : 4) : 2.2;
    if (emphasis) {
      ctx.shadowColor = "rgba(98, 168, 255, .45)";
      ctx.shadowBlur = 12;
    }
    ctx.strokeStyle = kind === "final"
      ? `rgba(98, 168, 255, ${opacity * .92})`
      : kind === "first"
        ? `rgba(191, 217, 247, ${opacity * .66})`
        : `rgba(124, 151, 190, ${opacity * .62})`;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawGrid() {
    ctx.strokeStyle = "rgba(105, 162, 229, .07)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const y = h * (.12 + i * .13);
      ctx.beginPath();
      ctx.moveTo(w * .51, y);
      ctx.lineTo(w * .98, y);
      ctx.stroke();
    }
  }

  function draw(now) {
    const cycle = reduced ? 0 : now / 5800;
    const current = Math.floor(cycle) % scenes.length;
    const next = (current + 1) % scenes.length;
    const raw = reduced ? 0 : cycle % 1;
    const mix = ease(Math.max(0, Math.min(1, (raw - .68) / .25)));
    const resetting = current === 6 && next === 0;
    const pointMix = resetting
      ? ease(Math.max(0, Math.min(1, (raw - .72) / .26)))
      : mix;
    const positions = [];

    ctx.clearRect(0, 0, w, h);
    drawGrid();

    points.forEach((p) => {
      const a = position(p, current, now);
      const b = position(p, next, now);
      positions.push([
        a[0] + (b[0] - a[0]) * pointMix,
        a[1] + (b[1] - a[1]) * pointMix
      ]);
    });

    const relationshipOpacity = sceneOpacity(2, current, next, mix);
    if (relationshipOpacity > 0) {
      edges.forEach(({ from, to, hub }, i) => {
        const a = positions[from];
        const b = positions[to];
        const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (distance > Math.min(w, h) * .11) return;
        const pulse = hub
          ? Math.max(0, Math.sin(now * .0014 + from * .17))
          : Math.max(0, Math.sin(now * (.0012 + (i % 5) * .00017) + i * 4.37));
        if (pulse < .28) return;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = `rgba(105, 184, 255, ${relationshipOpacity * pulse * (hub ? .72 : .5)})`;
        ctx.lineWidth = hub ? 1.35 : 1.05;
        ctx.stroke();
      });
    }

    if (current === 3) {
      const candidatesDraw = ease(Math.max(0, Math.min(1, raw / .38)));
      const opacity = 1;
      drawCurve("simple", opacity, candidatesDraw, trainingExtent);
      drawCurve("first", opacity, candidatesDraw, trainingExtent);
      drawCurve("final", opacity, candidatesDraw, trainingExtent);
    }

    if (current === 4) {
      const alternativesFade = ease(Math.max(0, Math.min(1, (raw - .2) / .38)));
      const opacity = 1;
      drawCurve("simple", opacity * (1 - alternativesFade), 1, trainingExtent);
      drawCurve("first", opacity * (1 - alternativesFade), 1, trainingExtent);
      drawCurve("final", opacity, 1, trainingExtent, true);
    }

    if (current === 5) {
      const extension = trainingExtent + (1 - trainingExtent) * ease(Math.max(0, Math.min(1, (raw - .12) / .56)));
      drawCurve("final", 1 - mix, extension, 1, true);
    }

    const validationOpacity = current === 6
      ? 1 - ease(Math.max(0, Math.min(1, (raw - .66) / .08)))
      : sceneOpacity(6, current, next, mix);
    drawCurve("final", validationOpacity, 1, 1, true);

    positions.forEach(([x, y], i) => {
      const p = points[i];
      const pulse = 1 + Math.sin(now * .002 + p.phase) * .07;
      const isHub = relationshipOpacity > 0 && hubIndices.includes(i);
      ctx.beginPath();
      ctx.arc(x, y, (isHub ? 3.8 : i % 9 === 0 ? 3 : 1.85) * pulse, 0, Math.PI * 2);
      ctx.fillStyle = isHub
        ? "rgba(98, 168, 255, 1)"
        : i % 9 === 0 ? "rgba(148, 207, 255, 1)" : "rgba(135, 192, 244, .86)";
      ctx.fill();
    });

    if (current === 6) {
      const { x0, span } = bounds();
      const reveal = ease(Math.max(0, Math.min(1, (raw - .08) / .3)));
      predictions.forEach((p, i) => {
        const local = Math.max(0, Math.min(1, reveal * 1.35 - i / predictionCount * .35));
        if (local <= 0) return;
        const u = trainingExtent + p.seed * (1 - trainingExtent);
        const x = x0 + u * span + p.xNoise * span * .035;
        const y = h * curveValue(u) + p.noise * h * .13;
        ctx.beginPath();
        ctx.arc(x, y, i % 6 === 0 ? 3 : 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(152, 207, 255, ${local * validationOpacity * .9})`;
        ctx.fill();
      });
    }

    const labelMix = resetting ? pointMix : mix;
    const visible = labelMix > .5 ? next : current;
    const textOpacity = reduced
      ? 1
      : Math.min(1, Math.abs(labelMix - .5) / .18);

    if (action) action.textContent = sceneCopy[visible][0];
    if (label) label.textContent = sceneCopy[visible][1];
    if (step) step.textContent = `${String(visible + 1).padStart(2, "0")} / 07`;
    if (action) action.style.opacity = textOpacity;
    if (label) label.style.opacity = textOpacity;
    if (step) step.style.opacity = textOpacity;
    if (!reduced) requestAnimationFrame(draw);
  }

  addEventListener("resize", resize, { passive: true });
  resize();
  requestAnimationFrame(draw);
})();
</script>
