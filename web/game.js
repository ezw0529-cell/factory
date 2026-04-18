(() => {
  const W = 720;
  const H = 1280;

  const PLAYER_W = 110;
  const PLAYER_H = 130;
  const PLAYER_Y = 980;
  const PLAYER_MARGIN = 30;

  const SCROLL_START = 520;
  const SCROLL_MAX = 1400;
  const SCROLL_ACCEL = 14;

  const OBS_W = 120;
  const OBS_H = 130;
  const SPAWN_MIN = 0.55;
  const SPAWN_MAX = 1.1;

  const STEER_SPEED = 1800;

  const BEST_KEY = "neukgurun.best";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const startOverlay = document.getElementById("start-overlay");
  const overOverlay = document.getElementById("over-overlay");
  const finalScoreEl = document.getElementById("final-score");
  const finalBestEl = document.getElementById("final-best");
  const overTitleEl = document.getElementById("over-title");
  const overSubEl = document.getElementById("over-sub");

  const BOSS_SCORE = 600;

  const state = {
    running: false,
    lastT: 0,
    scroll: SCROLL_START,
    distance: 0,
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    spawnTimer: 0.8,
    player: { x: W / 2, targetX: W / 2, bob: 0 },
    obstacles: [],
    roadOffset: 0,
    roadSideOffset: 0,
    clouds: seedClouds(),
    trees: seedTrees(),
    shake: 0,
    pointerActive: false,
    keyLeft: false,
    keyRight: false,
    phase: "normal", // "normal" | "approach" | "boss" | "victory"
    phaseT: 0,
    boss: null,
    bossAnnounce: 0,
  };

  bestEl.textContent = "최고 " + state.best;

  function seedClouds() {
    const arr = [];
    for (let i = 0; i < 5; i++) {
      arr.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 40 + Math.random() * 50,
      });
    }
    return arr;
  }

  function seedTrees() {
    const arr = [];
    for (let i = 0; i < 14; i++) {
      arr.push({
        x: Math.random() < 0.5 ? 30 + Math.random() * 80 : W - 110 + Math.random() * 80,
        y: Math.random() * H,
        r: 34 + Math.random() * 20,
      });
    }
    return arr;
  }

  function reset() {
    state.scroll = SCROLL_START;
    state.distance = 0;
    state.score = 0;
    state.spawnTimer = 0.6;
    state.player.x = W / 2;
    state.player.targetX = W / 2;
    state.player.bob = 0;
    state.obstacles = [];
    state.shake = 0;
    state.clouds = seedClouds();
    state.trees = seedTrees();
    state.phase = "normal";
    state.phaseT = 0;
    state.boss = null;
    state.bossAnnounce = 0;
    scoreEl.textContent = "점수 0";
  }

  function start() {
    reset();
    state.running = true;
    startOverlay.classList.add("hidden");
    overOverlay.classList.add("hidden");
    state.lastT = performance.now();
    requestAnimationFrame(loop);
  }

  function gameOver(reason) {
    state.running = false;
    state.shake = 28;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(BEST_KEY, String(state.best));
    }
    bestEl.textContent = "최고 " + state.best;
    finalScoreEl.textContent = "점수 " + state.score;
    finalBestEl.textContent = "최고 " + state.best;
    if (reason === "male") {
      overTitleEl.textContent = "알고보니 수컷…!";
      overSubEl.textContent = "\uD83D\uDC94 뜻밖의 반전. 놀랍지만 실화.";
      overSubEl.classList.remove("hidden");
    } else if (reason === "trump") {
      overTitleEl.textContent = "트럼프에게 잡혔다";
      overSubEl.textContent = "호르무즈 해협은 지켜졌다.";
      overSubEl.classList.remove("hidden");
    } else {
      overTitleEl.textContent = "잡혔다!";
      overSubEl.classList.add("hidden");
    }
    setTimeout(() => overOverlay.classList.remove("hidden"), 550);
  }

  function victory() {
    state.running = false;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(BEST_KEY, String(state.best));
    }
    bestEl.textContent = "최고 " + state.best;
    finalScoreEl.textContent = "점수 " + state.score;
    finalBestEl.textContent = "최고 " + state.best;
    overTitleEl.textContent = "호르무즈 돌파!";
    overSubEl.textContent = "늑구, 해협을 건너 자유로.";
    overSubEl.classList.remove("hidden");
    setTimeout(() => overOverlay.classList.remove("hidden"), 400);
  }

  // --- spawning ---
  // obstacles: 0 = net (zookeeper net), 1 = fence, 2 = barrel, 3 = "female" wolf (twist)
  function spawnObstacle() {
    const kind = Math.random();
    let type, w, h;
    if (kind < 0.45) {
      type = 0; w = OBS_W; h = OBS_H;
    } else if (kind < 0.72) {
      type = 1; w = 220 + Math.random() * 160; h = 70;
    } else if (kind < 0.88) {
      type = 2; w = 110; h = 110;
    } else {
      type = 3; w = 120; h = 150;
    }
    const x = PLAYER_MARGIN + Math.random() * (W - PLAYER_MARGIN * 2 - w);
    state.obstacles.push({ type, x, y: -h - 40, w, h, passed: false, phase: Math.random() * Math.PI * 2 });
  }

  // --- update ---
  function update(dt) {
    if (!state.running) return;

    state.scroll = Math.min(SCROLL_MAX, state.scroll + SCROLL_ACCEL * dt);
    state.distance += state.scroll * dt;
    const newScore = Math.floor(state.distance / 25);
    if (newScore !== state.score) {
      state.score = newScore;
      scoreEl.textContent = "점수 " + state.score;
    }

    // steering
    const p = state.player;
    if (state.pointerActive) {
      const dx = p.targetX - p.x;
      const maxStep = STEER_SPEED * 1.4 * dt;
      p.x += Math.max(-maxStep, Math.min(maxStep, dx));
    } else if (state.keyLeft || state.keyRight) {
      const dir = (state.keyRight ? 1 : 0) - (state.keyLeft ? 1 : 0);
      p.x += dir * STEER_SPEED * dt;
    }
    p.x = Math.max(PLAYER_MARGIN + PLAYER_W / 2, Math.min(W - PLAYER_MARGIN - PLAYER_W / 2, p.x));
    p.bob += dt;

    // scroll backgrounds
    state.roadOffset = (state.roadOffset + state.scroll * dt) % 160;
    for (const c of state.clouds) {
      c.y += state.scroll * 0.35 * dt;
      if (c.y - c.r > H) {
        c.y = -c.r;
        c.x = Math.random() * W;
        c.r = 40 + Math.random() * 50;
      }
    }
    for (const t of state.trees) {
      t.y += state.scroll * 0.9 * dt;
      if (t.y - t.r > H) {
        t.y = -t.r;
        t.x = Math.random() < 0.5 ? 30 + Math.random() * 80 : W - 110 + Math.random() * 80;
        t.r = 34 + Math.random() * 20;
      }
    }

    // player hitbox (reused for obstacle + boss collision)
    const px1 = p.x - PLAYER_W / 2 + 18;
    const px2 = p.x + PLAYER_W / 2 - 18;
    const py1 = PLAYER_Y - PLAYER_H / 2 + 14;
    const py2 = PLAYER_Y + PLAYER_H / 2 - 8;

    // phase transition into boss
    if (state.phase === "normal" && state.score >= BOSS_SCORE) {
      state.phase = "approach";
      state.phaseT = 0;
      state.bossAnnounce = 2.5;
    }
    if (state.bossAnnounce > 0) state.bossAnnounce = Math.max(0, state.bossAnnounce - dt);
    if (state.phase === "approach") {
      state.phaseT += dt;
      if (state.phaseT >= 2.2 && state.obstacles.length === 0) {
        state.phase = "boss";
        state.phaseT = 0;
        state.boss = {
          x: W / 2,
          y: -220,
          w: 360,
          h: 260,
          vx: 260,
          descend: 24,
          hit: false,
        };
      }
    }

    // spawn (only in normal phase)
    if (state.phase === "normal") {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnObstacle();
        const ratio = (state.scroll - SCROLL_START) / (SCROLL_MAX - SCROLL_START);
        const minI = Math.max(0.28, SPAWN_MIN - ratio * 0.28);
        const maxI = Math.max(0.45, SPAWN_MAX - ratio * 0.5);
        state.spawnTimer = minI + Math.random() * (maxI - minI);
      }
    }

    // move obstacles
    for (const o of state.obstacles) o.y += state.scroll * dt;
    state.obstacles = state.obstacles.filter((o) => o.y < H + 60);

    // boss movement
    if (state.phase === "boss" && state.boss) {
      const b = state.boss;
      b.x += b.vx * dt;
      if (b.x - b.w / 2 < PLAYER_MARGIN) { b.x = PLAYER_MARGIN + b.w / 2; b.vx = Math.abs(b.vx); }
      if (b.x + b.w / 2 > W - PLAYER_MARGIN) { b.x = W - PLAYER_MARGIN - b.w / 2; b.vx = -Math.abs(b.vx); }
      b.y += b.descend * dt;
      // slight speed-up
      b.vx *= 1 + dt * 0.05;
      // collision with boss
      const bx1 = b.x - b.w / 2 + 30;
      const bx2 = b.x + b.w / 2 - 30;
      const by1 = b.y + 20;
      const by2 = b.y + b.h - 20;
      if (px1 < bx2 && px2 > bx1 && py1 < by2 && py2 > by1) {
        gameOver("trump");
        return;
      }
      // victory when boss descends past player
      if (b.y > PLAYER_Y + PLAYER_H) {
        state.phase = "victory";
        victory();
        return;
      }
    }

    // obstacle collision
    for (const o of state.obstacles) {
      if (px1 < o.x + o.w - 6 && px2 > o.x + 6 && py1 < o.y + o.h - 6 && py2 > o.y + 6) {
        gameOver(o.type === 3 ? "male" : undefined);
        return;
      }
    }

    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 60);
  }

  // --- drawing ---
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawBackground() {
    const isBossBg = state.phase === "approach" || state.phase === "boss" || state.phase === "victory";

    if (isBossBg) {
      // sunset sky + ocean strait
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#ff6a3d");
      g.addColorStop(0.55, "#ffb56b");
      g.addColorStop(1, "#1f3a5c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // water shimmer
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      const band = 40;
      for (let y = (state.roadOffset % band) - band; y < H + band; y += band) {
        ctx.fillRect(0, y, W, 4);
      }

      // distant cliffs (left/right)
      ctx.fillStyle = "#3a2c1e";
      ctx.beginPath();
      ctx.moveTo(0, 300); ctx.lineTo(140, 220); ctx.lineTo(190, 340); ctx.lineTo(120, 420); ctx.lineTo(0, 400); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W, 260); ctx.lineTo(W - 180, 200); ctx.lineTo(W - 90, 320); ctx.lineTo(W - 150, 430); ctx.lineTo(W, 410); ctx.closePath(); ctx.fill();
    } else {
      // green fields
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#2e5d3c");
      g.addColorStop(1, "#4a8257");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "#7ea85a";
      ctx.fillRect(W * 0.18, 0, W * 0.64, H);

      ctx.fillStyle = "#3d5a2a";
      ctx.fillRect(W * 0.18 - 6, 0, 6, H);
      ctx.fillRect(W * 0.82, 0, 6, H);

      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      const dash = 60;
      const gap = 80;
      const step = dash + gap;
      for (let y = (state.roadOffset % step) - step; y < H + step; y += step) {
        ctx.fillRect(W / 2 - 6, y, 12, dash);
      }

      for (const t of state.trees) {
        ctx.fillStyle = "#2d4a25";
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a6030";
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.25, t.r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // soft clouds
    ctx.fillStyle = isBossBg ? "rgba(255, 200, 150, 0.3)" : "rgba(255, 255, 255, 0.18)";
    for (const c of state.clouds) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.arc(c.x + c.r * 0.7, c.y + 8, c.r * 0.7, 0, Math.PI * 2);
      ctx.arc(c.x - c.r * 0.6, c.y + 6, c.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer() {
    const p = state.player;
    const bob = Math.sin(p.bob * 14) * 4;
    const x = p.x - PLAYER_W / 2;
    const y = PLAYER_Y - PLAYER_H / 2 + bob;

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(p.x, PLAYER_Y + PLAYER_H / 2 + 6, PLAYER_W / 2 - 4, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // tail (behind, points down-back)
    ctx.fillStyle = "#6b4a2a";
    ctx.beginPath();
    ctx.ellipse(p.x, y + PLAYER_H - 8, 18, 36, 0, 0, Math.PI * 2);
    ctx.fill();

    // body (oval, top-down)
    ctx.fillStyle = "#8a6640";
    ctx.beginPath();
    ctx.ellipse(p.x, y + PLAYER_H * 0.55, PLAYER_W / 2 - 12, PLAYER_H * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // back stripe
    ctx.fillStyle = "#6b4a2a";
    ctx.beginPath();
    ctx.ellipse(p.x, y + PLAYER_H * 0.5, 10, PLAYER_H * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // head (front, bigger — top-down view)
    ctx.fillStyle = "#8a6640";
    ctx.beginPath();
    ctx.ellipse(p.x, y + PLAYER_H * 0.22, 40, 38, 0, 0, Math.PI * 2);
    ctx.fill();

    // ears (triangles on top corners)
    ctx.fillStyle = "#6b4a2a";
    ctx.beginPath();
    ctx.moveTo(p.x - 32, y + 6);
    ctx.lineTo(p.x - 20, y - 14);
    ctx.lineTo(p.x - 12, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x + 32, y + 6);
    ctx.lineTo(p.x + 20, y - 14);
    ctx.lineTo(p.x + 12, y + 10);
    ctx.closePath();
    ctx.fill();
    // ear inner
    ctx.fillStyle = "#d8a77a";
    ctx.beginPath();
    ctx.moveTo(p.x - 26, y + 2);
    ctx.lineTo(p.x - 20, y - 8);
    ctx.lineTo(p.x - 16, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x + 26, y + 2);
    ctx.lineTo(p.x + 20, y - 8);
    ctx.lineTo(p.x + 16, y + 6);
    ctx.closePath();
    ctx.fill();

    // snout (pointing down toward bottom — but wolf runs UP, so snout at top)
    ctx.fillStyle = "#d8c0a0";
    ctx.beginPath();
    ctx.ellipse(p.x, y + PLAYER_H * 0.08, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // nose
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(p.x, y + PLAYER_H * 0.02, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x - 14, y + PLAYER_H * 0.22, 6, 0, Math.PI * 2);
    ctx.arc(p.x + 14, y + PLAYER_H * 0.22, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(p.x - 14, y + PLAYER_H * 0.22, 3, 0, Math.PI * 2);
    ctx.arc(p.x + 14, y + PLAYER_H * 0.22, 3, 0, Math.PI * 2);
    ctx.fill();

    // running legs (side-bob animation)
    const legSwing = Math.sin(p.bob * 24) * 8;
    ctx.fillStyle = "#6b4a2a";
    roundRect(p.x - 34, y + PLAYER_H * 0.55 + legSwing, 14, 24, 4);
    ctx.fill();
    roundRect(p.x + 20, y + PLAYER_H * 0.55 - legSwing, 14, 24, 4);
    ctx.fill();
    roundRect(p.x - 34, y + PLAYER_H * 0.78 - legSwing, 14, 22, 4);
    ctx.fill();
    roundRect(p.x + 20, y + PLAYER_H * 0.78 + legSwing, 14, 22, 4);
    ctx.fill();
  }

  function drawObstacle(o) {
    if (o.type === 0) {
      // sooyukza net: handle + round net
      ctx.fillStyle = "#6b4a2a";
      ctx.fillRect(o.x + o.w / 2 - 6, o.y + o.h * 0.55, 12, o.h * 0.45);
      ctx.fillStyle = "#8a5a3a";
      ctx.beginPath();
      ctx.ellipse(o.x + o.w / 2, o.y + o.h * 0.4, o.w / 2 - 6, o.h * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      // mesh
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      for (let i = -5; i <= 5; i++) {
        const fx = i / 5;
        ctx.beginPath();
        ctx.moveTo(o.x + o.w / 2 + fx * (o.w / 2 - 10), o.y + o.h * 0.05);
        ctx.lineTo(o.x + o.w / 2 + fx * (o.w / 2 - 10), o.y + o.h * 0.75);
        ctx.stroke();
      }
      for (let i = 1; i <= 4; i++) {
        const ry = o.y + o.h * (0.08 + i * 0.15);
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, ry, (o.w / 2 - 10) * (1 - i * 0.05), 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (o.type === 1) {
      // wooden fence
      ctx.fillStyle = "#6b4a2a";
      ctx.fillRect(o.x, o.y + o.h * 0.35, o.w, 14);
      ctx.fillRect(o.x, o.y + o.h * 0.7, o.w, 14);
      ctx.fillStyle = "#8a5a3a";
      const posts = Math.max(3, Math.round(o.w / 70));
      for (let i = 0; i < posts; i++) {
        const px = o.x + (i + 0.5) * (o.w / posts) - 8;
        ctx.fillRect(px, o.y, 16, o.h);
      }
    } else if (o.type === 2) {
      // barrel
      ctx.fillStyle = "#a36b2a";
      roundRect(o.x, o.y, o.w, o.h, 16);
      ctx.fill();
      ctx.strokeStyle = "#6b4a2a";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(o.x + 6, o.y + o.h * 0.28);
      ctx.lineTo(o.x + o.w - 6, o.y + o.h * 0.28);
      ctx.moveTo(o.x + 6, o.y + o.h * 0.68);
      ctx.lineTo(o.x + o.w - 6, o.y + o.h * 0.68);
      ctx.stroke();
    } else if (o.type === 3) {
      // "female" wolf bait
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      // hearts aura
      ctx.fillStyle = "rgba(255, 120, 160, 0.55)";
      const t = performance.now() / 500 + o.phase;
      for (let i = 0; i < 4; i++) {
        const a = t + i * Math.PI / 2;
        const hx = cx + Math.cos(a) * (o.w / 2 + 14);
        const hy = cy + Math.sin(a) * (o.h / 2 + 10);
        ctx.beginPath();
        ctx.arc(hx - 6, hy, 8, 0, Math.PI * 2);
        ctx.arc(hx + 6, hy, 8, 0, Math.PI * 2);
        ctx.moveTo(hx - 14, hy + 2);
        ctx.lineTo(hx, hy + 18);
        ctx.lineTo(hx + 14, hy + 2);
        ctx.fill();
      }
      // wolf (pink-tinted)
      ctx.fillStyle = "#c79a8a";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 20, o.w * 0.36, o.h * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy - 28, o.w * 0.32, o.h * 0.27, 0, 0, Math.PI * 2);
      ctx.fill();
      // ears
      ctx.fillStyle = "#a07868";
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy - 40); ctx.lineTo(cx - 14, cy - 62); ctx.lineTo(cx - 6, cy - 36); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 26, cy - 40); ctx.lineTo(cx + 14, cy - 62); ctx.lineTo(cx + 6, cy - 36); ctx.closePath(); ctx.fill();
      // pink ribbon on head
      ctx.fillStyle = "#ff6fa1";
      ctx.beginPath();
      ctx.moveTo(cx - 2, cy - 52); ctx.lineTo(cx - 18, cy - 58); ctx.lineTo(cx - 18, cy - 44); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy - 52); ctx.lineTo(cx + 18, cy - 58); ctx.lineTo(cx + 18, cy - 44); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ff3f80";
      ctx.beginPath(); ctx.arc(cx, cy - 51, 5, 0, Math.PI * 2); ctx.fill();
      // eyelashes + blush
      ctx.strokeStyle = "#111"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - 16, cy - 28); ctx.lineTo(cx - 22, cy - 34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 16, cy - 28); ctx.lineTo(cx + 22, cy - 34); ctx.stroke();
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(cx - 14, cy - 26, 3, 0, Math.PI * 2); ctx.arc(cx + 14, cy - 26, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255, 120, 140, 0.6)";
      ctx.beginPath(); ctx.arc(cx - 22, cy - 18, 6, 0, Math.PI * 2); ctx.arc(cx + 22, cy - 18, 6, 0, Math.PI * 2); ctx.fill();
      // snout
      ctx.fillStyle = "#e6c4b4";
      ctx.beginPath(); ctx.ellipse(cx, cy - 10, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.ellipse(cx, cy - 14, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBoss() {
    const b = state.boss;
    if (!b) return;
    const cx = b.x;
    const y = b.y;
    // body / suit
    ctx.fillStyle = "#1b2a48";
    roundRect(cx - b.w / 2 + 20, y + b.h * 0.55, b.w - 40, b.h * 0.45, 20);
    ctx.fill();
    // shirt v
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(cx - 30, y + b.h * 0.55);
    ctx.lineTo(cx, y + b.h * 0.78);
    ctx.lineTo(cx + 30, y + b.h * 0.55);
    ctx.closePath();
    ctx.fill();
    // red tie
    ctx.fillStyle = "#d62a2a";
    ctx.beginPath();
    ctx.moveTo(cx - 14, y + b.h * 0.55);
    ctx.lineTo(cx + 14, y + b.h * 0.55);
    ctx.lineTo(cx + 10, y + b.h * 0.72);
    ctx.lineTo(cx, y + b.h * 0.95);
    ctx.lineTo(cx - 10, y + b.h * 0.72);
    ctx.closePath();
    ctx.fill();
    // head (orange tan)
    ctx.fillStyle = "#f2a56a";
    ctx.beginPath();
    ctx.ellipse(cx, y + b.h * 0.4, 90, 72, 0, 0, Math.PI * 2);
    ctx.fill();
    // jowl shadow
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.beginPath();
    ctx.ellipse(cx, y + b.h * 0.5, 80, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    // hair (yellow swoop)
    ctx.fillStyle = "#f7d85a";
    ctx.beginPath();
    ctx.moveTo(cx - 90, y + b.h * 0.32);
    ctx.quadraticCurveTo(cx - 60, y + 10, cx + 40, y + 30);
    ctx.quadraticCurveTo(cx + 110, y + 40, cx + 90, y + b.h * 0.3);
    ctx.quadraticCurveTo(cx + 40, y + b.h * 0.22, cx - 90, y + b.h * 0.32);
    ctx.fill();
    // squint eyes
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 36, y + b.h * 0.38);
    ctx.lineTo(cx - 18, y + b.h * 0.38);
    ctx.moveTo(cx + 18, y + b.h * 0.38);
    ctx.lineTo(cx + 36, y + b.h * 0.38);
    ctx.stroke();
    // mouth
    ctx.fillStyle = "#3a1f1f";
    roundRect(cx - 18, y + b.h * 0.48, 36, 10, 4);
    ctx.fill();
    // MAGA-ish hat
    ctx.fillStyle = "#d62a2a";
    roundRect(cx - 70, y + b.h * 0.05, 130, 26, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("HORMUZ", cx, y + b.h * 0.05 + 19);

    // arms out (blocking)
    ctx.fillStyle = "#1b2a48";
    roundRect(cx - b.w / 2 - 10, y + b.h * 0.55, 70, 40, 14);
    ctx.fill();
    roundRect(cx + b.w / 2 - 60, y + b.h * 0.55, 70, 40, 14);
    ctx.fill();
    ctx.fillStyle = "#f2a56a";
    ctx.beginPath(); ctx.arc(cx - b.w / 2 - 6, y + b.h * 0.75, 22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + b.w / 2 + 6, y + b.h * 0.75, 22, 0, Math.PI * 2); ctx.fill();
  }

  function drawBossAnnounce() {
    if (state.bossAnnounce <= 0) return;
    const alpha = Math.min(1, state.bossAnnounce);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.55 * alpha})`;
    ctx.fillRect(0, H * 0.38, W, 180);
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(255, 220, 80, ${alpha})`;
    ctx.font = "bold 68px sans-serif";
    ctx.fillText("호르무즈 해협", W / 2, H * 0.48);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.font = "bold 34px sans-serif";
    ctx.fillText("최종 관문 — 트럼프 등장!", W / 2, H * 0.53);
  }

  function render() {
    const sx = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    const sy = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
    drawBackground();
    for (const o of state.obstacles) drawObstacle(o);
    drawPlayer();
    if (state.phase === "boss" || state.phase === "victory") drawBoss();
    drawBossAnnounce();
    ctx.restore();
  }

  function loop(t) {
    const dt = Math.min(0.033, (t - state.lastT) / 1000);
    state.lastT = t;
    update(dt);
    render();
    if (state.running || state.shake > 0) requestAnimationFrame(loop);
  }

  // --- input ---
  function canvasXFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const ratio = (clientX - rect.left) / rect.width;
    return ratio * W;
  }

  function onPointerDown(e) {
    e.preventDefault();
    if (!state.running) return;
    state.pointerActive = true;
    state.player.targetX = canvasXFromEvent(e);
  }
  function onPointerMove(e) {
    if (!state.pointerActive) return;
    e.preventDefault();
    state.player.targetX = canvasXFromEvent(e);
  }
  function onPointerUp(e) {
    if (e) e.preventDefault();
    state.pointerActive = false;
  }

  canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  canvas.addEventListener("touchmove", onPointerMove, { passive: false });
  canvas.addEventListener("touchend", onPointerUp, { passive: false });
  canvas.addEventListener("touchcancel", onPointerUp, { passive: false });
  canvas.addEventListener("mousedown", onPointerDown);
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);

  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") { state.keyLeft = true; e.preventDefault(); }
    else if (e.code === "ArrowRight" || e.code === "KeyD") { state.keyRight = true; e.preventDefault(); }
    else if (e.code === "Space" || e.code === "Enter") {
      if (!state.running) { start(); e.preventDefault(); }
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") state.keyLeft = false;
    else if (e.code === "ArrowRight" || e.code === "KeyD") state.keyRight = false;
  });

  document.getElementById("start-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    start();
  });
  document.getElementById("restart-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    start();
  });

  render();
})();
