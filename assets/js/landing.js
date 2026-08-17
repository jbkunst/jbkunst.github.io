<script>
(() => {
  const canvas = document.getElementById("data-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const label = document.getElementById("chart-name");
  const step = document.getElementById("chart-step");
  const action = document.getElementById("chart-action");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scenes = ["data", "patterns", "relationships", "models", "decision", "predictions", "validation", "sharing"];
  const sceneCopy = [
    ["I explore", "data"],
    ["I find", "patterns"],
    ["I map", "relationships"],
    ["I build", "models"],
    ["I guide", "decisions"],
    ["I make", "predictions"],
    ["I assess", "performance"],
    ["I keep", "learning"]
  ];
  const count = 110;
  const predictionCount = 24;
  const trainingExtent = .8;
  const curveCenter = .4208;
  const points = Array.from({ length: count }, (_, i) => ({
    index: i,
    seed: i / (count - 1),
    noise: Math.sin(i * 91.73) * .52 + Math.cos(i * 17.31) * .48,
    phase: (i * 2.399) % (Math.PI * 2)
  }));
  const predictions = Array.from({ length: predictionCount }, (_, i) => ({
    seed: i / (predictionCount - 1),
    xNoise: ((Math.sin((i + 1) * 127.1) * 43758.5453) % 1 + 1) % 1 - .5,
    noise: ((Math.sin((i + 1) * 311.7) * 43758.5453) % 1 + 1) % 1 - .5
  }));
  const communityHubIndices = [0, 18, 36, 54, 72, 90];
  const hubIndices = [...communityHubIndices];
  const networkGroups = communityHubIndices.map((hub, group) => ({
    group,
    hub,
    nodes: points
      .map((_, i) => i)
      .filter((i) => !hubIndices.includes(i) && i % communityHubIndices.length === group)
  }));
  const edges = (() => {
    const result = [];
    const seen = new Set();
    const add = (from, to, options = {}) => {
      if (from === to) return;
      const key = from < to ? `${from}-${to}` : `${to}-${from}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ from, to, depth: 2, hub: false, ...options });
    };

    networkGroups.forEach(({ group, hub, nodes }) => {
      const members = [hub, ...nodes];
      nodes.forEach((node, i) => {
        if (i % 3 === 0) add(node, members[(i * 5 + 2) % members.length], { group });
        add(node, members[(i + 3) % members.length], { group });
        if (i % 4 === 0) add(hub, node, { group, depth: 1, hub: true });
      });
    });

    [[0, 2], [2, 4], [4, 5], [5, 3], [3, 1], [1, 0], [2, 3], [0, 4]].forEach(([a, b]) => {
      add(communityHubIndices[a], communityHubIndices[b], {
        group: a, depth: 1, hub: true, bridge: true
      });
    });
    [[7, 38], [19, 68], [35, 88], [51, 101], [14, 75], [42, 93]].forEach(([from, to]) => {
      add(from, to, { depth: 2, bridge: true });
    });
    return result;
  })();
  const networkDegree = Array(count).fill(0);
  edges.forEach(({ from, to }) => {
    networkDegree[from] += 1;
    networkDegree[to] += 1;
  });
  const networkState = points.map((p) => ({
    x: Math.cos(p.phase) * (.08 + p.seed * .12),
    y: Math.sin(p.phase) * (.06 + p.seed * .1),
    vx: 0,
    vy: 0
  }));

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
    const x0 = w * .45;
    const x1 = w * .87;
    const top = h * .2;
    const bottom = h * .78;
    return { x0, x1, span: x1 - x0, top, bottom, mid: (top + bottom) / 2 };
  }

  function confinePosition(x, y) {
    const { x0, x1, top, bottom } = bounds();
    return [
      Math.max(x0 + 5, Math.min(x1 - 5, x)),
      Math.max(top + 5, Math.min(bottom - 5, y))
    ];
  }

  function curveValue(u) {
    const x = 50 * u;
    const truth = 20 + .5 * x + 12 * Math.sin(x / 5);
    return .71 - truth / 120;
  }

  function projectCurve(value) {
    const { mid } = bounds();
    return mid + (value - curveCenter) * h * .95;
  }

  function updateNetwork(now) {
    const charge = .0000045;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const a = networkState[i];
        const b = networkState[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance2 = Math.max(.00035, dx * dx + dy * dy);
        const force = charge / distance2;
        a.vx -= dx * force;
        a.vy -= dy * force;
        b.vx += dx * force;
        b.vy += dy * force;
      }
    }

    edges.forEach(({ from, to, depth }) => {
      const a = networkState[from];
      const b = networkState[to];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(.001, Math.hypot(dx, dy));
      const target = depth === 0 ? .13 : depth === 1 ? .085 : .065;
      const force = (distance - target) * .018;
      const fx = dx / distance * force;
      const fy = dy / distance * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    });

    networkState.forEach((node, i) => {
      node.vx += -node.x * .0012 + Math.sin(now * .00031 + points[i].phase) * .000018;
      node.vy += -node.y * .0012 + Math.cos(now * .00027 + points[i].phase) * .000018;
      node.vx *= .88;
      node.vy *= .88;
      node.x = Math.max(-.47, Math.min(.47, node.x + node.vx));
      node.y = Math.max(-.36, Math.min(.36, node.y + node.vy));
    });
  }

  function position(p, scene, now, sceneProgress = 1) {
    const { x0, span, mid, top, bottom } = bounds();

    if (scene === 0) {
      const angle = p.phase + now * .00011;
      const radius = (.1 + p.seed * .9) * Math.min(span * .44, (bottom - top) * .66);
      return confinePosition(
        x0 + span * .5 + Math.cos(angle * 2.05) * radius,
        mid + Math.sin(angle * 1.72) * radius * .72
      );
    }

    if (scene === 1) {
      const orbit = now * .0011 + p.phase;
      const noiseScale = .026 + p.seed * .052;
      return confinePosition(
        x0 + p.seed * span + Math.cos(orbit) * 8,
        mid + (p.seed - .5) * -h * .38
          + p.noise * h * noiseScale + Math.sin(orbit) * 9
      );
    }

    if (scene === 2) {
      const node = networkState[p.index];
      const drift = now * .001 + p.phase;
      return confinePosition(
        x0 + span * (.52 + node.x * .88) + Math.cos(drift) * 5,
        mid + h * node.y * .60 + Math.sin(drift * 1.17) * 7
      );
    }

    if (scene === 7) {
      const spread = ease(Math.max(0, Math.min(1, (sceneProgress - .12) / .58)));
      const centerX = x0 + span * .53;
      const centerY = mid;
      const agitation = p.phase + now * .0032;
      const centerRadius = (8 + (p.seed * 83 % 1) * 26) * (1 - spread);
      const thoughtAngle = p.phase * 1.37 + Math.sin(p.seed * 31) * .42;
      const thoughtDistance = .2 + ((p.seed * 71) % 1) * .8;
      const drift = now * .00028 + p.phase;
      return [
        centerX + Math.cos(agitation * 1.9) * centerRadius
          + Math.cos(thoughtAngle) * span * .52 * thoughtDistance * spread
          + Math.cos(drift) * 7 * spread,
        centerY + Math.sin(agitation * 1.55) * centerRadius * .72
          + Math.sin(thoughtAngle) * h * .42 * thoughtDistance * spread
          + Math.sin(drift * 1.23) * 6 * spread
      ];
    }

    const trainingSpan = span * trainingExtent;
    const u = p.seed;
    const drift = now * .001 + p.phase;
    const noiseScale = u < .32 ? .04 : .055;
    return confinePosition(
      x0 + u * trainingSpan + Math.cos(drift) * 5,
      projectCurve(curveValue(u * trainingExtent))
        + p.noise * h * noiseScale + Math.sin(drift * 1.17) * 7
    );
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
      let y = projectCurve(curveValue(u));
      if (kind === "first") {
        y += Math.sin(u * Math.PI * 6.4 + .5) * h * .03;
        y += Math.sin(u * Math.PI * 18.5) * h * .012;
      } else if (kind === "simple") {
        const start = curveValue(0);
        const end = curveValue(trainingExtent);
        const v = Math.min(1, u / trainingExtent);
        const broadCurve = .052 * Math.sin(v * Math.PI - .35);
        y = projectCurve(start + (end - start) * v + broadCurve);
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

  function draw(now) {
    const cycle = reduced ? 0 : now / 5800;
    const current = Math.floor(cycle) % scenes.length;
    const next = (current + 1) % scenes.length;
    const raw = reduced ? 0 : cycle % 1;
    const mix = ease(Math.max(0, Math.min(1, (raw - .68) / .25)));
    const resetting = current === 7 && next === 0;
    const pointMix = resetting
      ? ease(Math.max(0, Math.min(1, (raw - .72) / .26)))
      : mix;
    const positions = [];

    ctx.clearRect(0, 0, w, h);

    if (current === 2 || next === 2) updateNetwork(now);

    points.forEach((p) => {
      const a = position(p, current, now, raw);
      const b = position(p, next, now, 0);
      positions.push([
        a[0] + (b[0] - a[0]) * pointMix,
        a[1] + (b[1] - a[1]) * pointMix
      ]);
    });

    const relationshipOpacity = sceneOpacity(2, current, next, mix);
    if (relationshipOpacity > 0) {
      edges.forEach(({ from, to, hub, depth, bridge }, i) => {
        const a = positions[from];
        const b = positions[to];
        const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!hub && distance > Math.min(w, h) * .11) return;
        const pulse = .68 + Math.sin(now * (.00065 + (i % 5) * .00005) + i * 1.73) * .22;
        const depthStrength = [1, .7, .42][depth] || .42;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        const edgeStrength = bridge ? .58 : .72;
        ctx.strokeStyle = `rgba(105, 184, 255, ${relationshipOpacity * pulse * depthStrength * edgeStrength})`;
        ctx.lineWidth = depth === 0 ? 1.05 : depth === 1 ? .75 : .5;
        ctx.stroke();
      });

      const signalTime = now / 1000;
      const signalWindow = .9;
      const signalBurst = signalTime % signalWindow;
      const burstCounts = [4, 5, 3, 6, 5, 4];
      const burstIndex = Math.floor(signalTime / signalWindow);
      const signalHub = hubIndices[burstIndex % hubIndices.length];
      const signalCount = burstCounts[burstIndex % burstCounts.length];
      const signalEdges = edges
        .filter(({ from, to }) => from === signalHub || to === signalHub)
        .slice(0, signalCount);
      const signalSegments = [];

      signalEdges.forEach((edge, i) => {
        const neighbor = edge.from === signalHub ? edge.to : edge.from;
        const outward = i % 2 === 0;
        const nextEdge = edges.find(({ from, to }) =>
          (from === neighbor || to === neighbor)
            && from !== signalHub
            && to !== signalHub
        );
        const delay = .04 + (i % 3) * .025;

        if (outward) {
          signalSegments.push({ from: signalHub, to: neighbor, delay });
          if (nextEdge) {
            const next = nextEdge.from === neighbor ? nextEdge.to : nextEdge.from;
            signalSegments.push({ from: neighbor, to: next, delay: .26 + delay });
          }
        } else {
          if (nextEdge) {
            const next = nextEdge.from === neighbor ? nextEdge.to : nextEdge.from;
            signalSegments.push({ from: next, to: neighbor, delay });
          }
          signalSegments.push({ from: neighbor, to: signalHub, delay: .26 + delay });
        }
      });

      signalSegments.forEach(({ from, to, delay }) => {
        const local = (signalBurst - delay) / .58;
        if (local <= 0 || local >= 1) return;
        const t = ease(local);
        const tail = Math.max(.06, t - .2);
        const head = Math.min(.94, t + .035);
        const a = positions[from];
        const b = positions[to];
        const alpha = Math.sin(Math.PI * local);

        ctx.beginPath();
        ctx.moveTo(
          a[0] + (b[0] - a[0]) * tail,
          a[1] + (b[1] - a[1]) * tail
        );
        ctx.lineTo(
          a[0] + (b[0] - a[0]) * head,
          a[1] + (b[1] - a[1]) * head
        );
        ctx.strokeStyle = `rgba(184, 222, 255, ${relationshipOpacity * alpha * .82})`;
        ctx.lineWidth = .95;
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
      ctx.beginPath();
      ctx.arc(x, y, (i % 9 === 0 ? 3 : 1.85) * pulse, 0, Math.PI * 2);
      ctx.fillStyle = i % 9 === 0
        ? "rgba(148, 207, 255, 1)"
        : "rgba(135, 192, 244, .86)";
      ctx.fill();
    });

    if (current === 6) {
      const { x0, x1, span, top, bottom } = bounds();
      const reveal = ease(Math.max(0, Math.min(1, (raw - .08) / .3)));
      predictions.forEach((p, i) => {
        const local = Math.max(0, Math.min(1, reveal * 1.35 - i / predictionCount * .35));
        if (local <= 0) return;
        const u = trainingExtent + p.seed * (1 - trainingExtent);
        const x = Math.max(x0 + 5, Math.min(x1 - 5, x0 + u * span + p.xNoise * span * .035));
        const y = Math.max(
          top + 5,
          Math.min(bottom - 5, projectCurve(curveValue(u)) + p.noise * h * .13)
        );
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
    if (step) step.textContent = `${String(visible + 1).padStart(2, "0")} / 08`;
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
