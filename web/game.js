(() => {
  const W = 720;
  const H = 1280;

  const PLAYER_W = 110;
  const PLAYER_H = 130;
  const PLAYER_Y = 980;
  const PLAYER_MARGIN = 30;

  const SCROLL_START = 420;
  const SCROLL_MAX = 950;
  const SCROLL_ACCEL = 8;

  const OBS_W = 120;
  const OBS_H = 130;
  const SPAWN_MIN = 0.85;
  const SPAWN_MAX = 1.7;

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
  const creditsOverlay = document.getElementById("credits-overlay");
  const creditsScroll = document.getElementById("credits-scroll");

  const BOSS_SCORE = 440;

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
    scenery: [],
    shake: 0,
    pointerActive: false,
    keyLeft: false,
    keyRight: false,
    phase: "normal", // "normal" | "approach" | "boss" | "victory"
    phaseT: 0,
    boss: null,
    bossAnnounce: 0,
    bullets: [],
    sungsimdangSpawned: false,
    stadiumSpawned: false,
    reveal: null, // { x, y, t } when "암컷 → 수컷" flip is playing
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

  const DAEJEON_SIGNS = [
    "햇살로", "푸른동", "달빛로", "노을동",
    "민들레로", "별빛동", "바람길", "미소로",
    "새벽동", "꿈빛로",
  ];

  function makeScenery(y) {
    const side = Math.random() < 0.5 ? "L" : "R";
    const roll = Math.random();
    let kind, w, h;
    if (roll < 0.18) {
      kind = "sign"; w = 90; h = 100;
    } else if (roll < 0.8) {
      kind = "building"; w = 110; h = 100 + Math.random() * 60;
    } else {
      kind = "tree"; w = 60; h = 60;
    }
    const x = side === "L"
      ? 10 + Math.random() * (W * 0.18 - 20 - w)
      : W - W * 0.18 + 10 + Math.random() * (W * 0.18 - 20 - w);
    return { kind, x, y, w, h, label: DAEJEON_SIGNS[Math.floor(Math.random() * DAEJEON_SIGNS.length)] };
  }

  function spawnSungsimdang() {
    // big landmark — only spawned once per run, early
    const side = Math.random() < 0.5 ? "L" : "R";
    const w = 200;
    const h = 460;
    const x = side === "L" ? -60 : W - w + 60;  // extends past the sidewalk
    state.scenery.push({ kind: "sungsimdang_big", x, y: -h - 40, w, h, label: null });
  }

  function spawnStadium() {
    // big stadium landmark — extends past the sidewalk, larger footprint
    const side = Math.random() < 0.5 ? "L" : "R";
    const w = 340;
    const h = 500;
    const x = side === "L" ? -140 : W - w + 140;  // partially off-screen
    state.scenery.push({ kind: "stadium_big", x, y: -h - 40, w, h, side });
  }

  function seedScenery() {
    const arr = [];
    for (let i = 0; i < 10; i++) arr.push(makeScenery(Math.random() * H));
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
    state.scenery = seedScenery();
    state.phase = "normal";
    state.phaseT = 0;
    state.boss = null;
    state.bossAnnounce = 0;
    state.bullets = [];
    state.sungsimdangSpawned = false;
    state.stadiumSpawned = false;
    state.reveal = null;
    // zoo gate behind the wolf at the very start
    state.scenery.push({ kind: "zoo_gate", x: 0, y: 260, w: W, h: 320 });
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
      overTitleEl.textContent = "도람뿌에게 잡혔다";
      overSubEl.textContent = "해협은 지켜졌다.";
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
    setTimeout(() => {
      creditsOverlay.classList.remove("hidden");
      // restart animation each time credits show
      creditsScroll.style.animation = "none";
      void creditsScroll.offsetWidth;
      creditsScroll.style.animation = "";
    }, 500);
  }

  // --- spawning ---
  // obstacles: 0 = person (zookeeper/police/rescue), 1 = fence, 2 = barrel, 3 = "female" wolf (twist)
  const PERSON_KINDS = ["zookeeper", "police", "rescue"];
  function spawnObstacle() {
    const kind = Math.random();
    let type, w, h, sub = null;
    if (kind < 0.4) {
      type = 0; w = 110; h = 150;
      sub = PERSON_KINDS[Math.floor(Math.random() * PERSON_KINDS.length)];
    } else if (kind < 0.6) {
      type = 1; w = 220 + Math.random() * 160; h = 70;
    } else if (kind < 0.72) {
      type = 2; w = 110; h = 110;
    } else {
      type = 3; w = 120; h = 150;
    }
    const x = PLAYER_MARGIN + Math.random() * (W - PLAYER_MARGIN * 2 - w);
    state.obstacles.push({ type, sub, x, y: -h - 40, w, h, passed: false, phase: Math.random() * Math.PI * 2 });
  }

  function spawnTanker() {
    const w = 110;
    const h = 240;
    const x = 90 + Math.random() * (W - 180 - w);
    state.obstacles.push({ type: 4, sub: null, x, y: -h - 40, w, h, passed: false, phase: Math.random() * Math.PI * 2 });
  }

  // --- update ---
  function update(dt) {
    if (!state.running) return;

    // 암컷→수컷 reveal pauses the world until game-over kicks in
    if (state.reveal) {
      state.reveal.t += dt;
      state.shake = Math.min(20, state.shake + 30 * dt);
      if (state.reveal.t >= 0.9) {
        state.reveal = null;
        gameOver("male");
      }
      return;
    }

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
    for (let i = 0; i < state.scenery.length; i++) {
      const s = state.scenery[i];
      s.y += state.scroll * 0.9 * dt;
      if (s.y - s.h > H) state.scenery[i] = makeScenery(-s.h - Math.random() * 200);
    }

    // player hitbox (reused for obstacle + boss collision — forgiving)
    const px1 = p.x - PLAYER_W / 2 + 32;
    const px2 = p.x + PLAYER_W / 2 - 32;
    const py1 = PLAYER_Y - PLAYER_H / 2 + 28;
    const py2 = PLAYER_Y + PLAYER_H / 2 - 18;

    // early landmark: big 선심당 once, a few seconds in
    if (!state.sungsimdangSpawned && state.phase === "normal" && state.distance > 2600) {
      state.sungsimdangSpawned = true;
      spawnSungsimdang();
    }
    // mid landmark: baseball stadium (spaced out with doubled boss timer)
    if (!state.stadiumSpawned && state.phase === "normal" && state.distance > 6500) {
      state.stadiumSpawned = true;
      spawnStadium();
    }

    // phase transition into boss
    if (state.phase === "normal" && state.score >= BOSS_SCORE) {
      state.phase = "approach";
      state.phaseT = 0;
      state.bossAnnounce = 2.5;
      // clear any land obstacles — the world changes to the strait
      state.obstacles = [];
      state.bullets = [];
      // let the first tanker come in soon after the banner appears
      state.spawnTimer = 0.9;
    }
    if (state.bossAnnounce > 0) state.bossAnnounce = Math.max(0, state.bossAnnounce - dt);
    if (state.phase === "approach" || state.phase === "boss" || state.phase === "victory") {
      state.phaseT += dt;
    }
    if (state.phase === "approach") {
      if (state.phaseT >= 6.0) {
        state.phase = "boss";
        state.phaseT = 0;
        state.boss = {
          x: W / 2,
          y: -200,
          baseX: W / 2,
          w: 260,
          h: 230,
          vy: 85,
          wobbleT: 0,
          fireTimer: 0.8,
          dead: false,
          deadT: 0,
        };
      }
    }

    // spawn (land obstacles in normal, tankers during approach/boss)
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
    // during approach/boss, no obstacles spawn — tankers are background only

    // move obstacles
    for (const o of state.obstacles) o.y += state.scroll * dt;
    state.obstacles = state.obstacles.filter((o) => o.y < H + 60);

    // boss: slow descent through center, fire while high, then drop
    if (state.phase === "boss" && state.boss) {
      const b = state.boss;
      const KILL_LINE = H * 0.42;
      if (!b.dead) {
        b.wobbleT += dt;
        b.x = b.baseX + Math.sin(b.wobbleT * 0.7) * 110;
        b.y += b.vy * dt;
        // trigger mario-death when crossing the kill line
        if (b.y > KILL_LINE) {
          b.dead = true;
          b.deadT = 0;
        } else {
          // only fire while above the kill line
          b.fireTimer -= dt;
          if (b.fireTimer <= 0) {
            const bx = b.x;
            const by = b.y + b.h * 0.5;
            const dx = p.x - bx;
            const dy = PLAYER_Y - by;
            const mag = Math.hypot(dx, dy) || 1;
            const speed = 520;
            state.bullets.push({
              x: bx, y: by,
              vx: dx / mag * speed,
              vy: dy / mag * speed,
              r: 26,
              spin: 0,
            });
            b.fireTimer = 0.8;
          }
        }
      } else {
        // mario-death sequence: brief hover then fast drop
        b.deadT += dt;
        if (b.deadT < 0.35) {
          b.y -= 260 * dt;
        } else {
          b.y += 1700 * dt * Math.min(1, (b.deadT - 0.35) * 3);
        }
        // once death animation is done, just call it a win
        if (b.deadT > 0.85) {
          state.phase = "victory";
          state.boss = null;
          victory();
          return;
        }
      }
    }

    // bullets update
    for (const bt of state.bullets) {
      bt.x += bt.vx * dt;
      bt.y += bt.vy * dt;
      bt.spin += dt * 6;
    }
    state.bullets = state.bullets.filter(
      (bt) => bt.y < H + 60 && bt.y > -60 && bt.x > -60 && bt.x < W + 60
    );

    // bullet collision
    for (const bt of state.bullets) {
      const dx = bt.x - p.x;
      const dy = bt.y - PLAYER_Y;
      if (Math.hypot(dx, dy) < bt.r + 24) {
        gameOver("trump");
        return;
      }
    }

    // obstacle collision (extra padding on obstacle sides too)
    for (const o of state.obstacles) {
      if (px1 < o.x + o.w - 14 && px2 > o.x + 14 && py1 < o.y + o.h - 14 && py2 > o.y + 14) {
        if (o.type === 3) {
          state.reveal = { x: o.x + o.w / 2, y: o.y + o.h / 2, t: 0 };
        } else {
          gameOver();
        }
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
      // sunset sky
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
      sky.addColorStop(0, "#ff5a2a");
      sky.addColorStop(0.5, "#ff9b4a");
      sky.addColorStop(1, "#ffd27a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H * 0.55);

      // sun disc
      ctx.fillStyle = "#fff0b0";
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.32, 85, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 220, 150, 0.4)";
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.32, 130, 0, Math.PI * 2);
      ctx.fill();

      // sea
      const sea = ctx.createLinearGradient(0, H * 0.55, 0, H);
      sea.addColorStop(0, "#2a6a8a");
      sea.addColorStop(1, "#0f2440");
      ctx.fillStyle = sea;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);

      // sun reflection shimmer
      ctx.fillStyle = "rgba(255, 240, 160, 0.45)";
      const shimmer = Math.sin(state.phaseT * 3) * 8;
      for (let y = H * 0.56; y < H; y += 18) {
        const wobble = Math.sin(y * 0.05 + state.phaseT * 2) * 10 + shimmer;
        ctx.fillRect(W / 2 - 30 + wobble, y, 60 - Math.abs(wobble), 3);
      }

      // wave stripes across
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      for (let y = H * 0.58; y < H; y += 46) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 20) {
          const wy = y + Math.sin(x * 0.06 + state.phaseT * 4) * 4;
          if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }

      // fleet of tankers crowded across the strait (horizontal silhouettes)
      drawStraitFleet();

      // dramatic cliffs — left
      ctx.fillStyle = "#5a3a24";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, H * 0.62);
      ctx.lineTo(110, H * 0.58);
      ctx.lineTo(140, H * 0.48);
      ctx.lineTo(100, H * 0.36);
      ctx.lineTo(130, H * 0.22);
      ctx.lineTo(90, H * 0.12);
      ctx.lineTo(60, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#8a5a2e";
      ctx.beginPath();
      ctx.moveTo(0, H * 0.28);
      ctx.lineTo(80, H * 0.22);
      ctx.lineTo(60, H * 0.4);
      ctx.lineTo(0, H * 0.45);
      ctx.closePath();
      ctx.fill();

      // dramatic cliffs — right
      ctx.fillStyle = "#5a3a24";
      ctx.beginPath();
      ctx.moveTo(W, 0);
      ctx.lineTo(W, H * 0.62);
      ctx.lineTo(W - 120, H * 0.58);
      ctx.lineTo(W - 150, H * 0.46);
      ctx.lineTo(W - 100, H * 0.34);
      ctx.lineTo(W - 140, H * 0.22);
      ctx.lineTo(W - 80, H * 0.1);
      ctx.lineTo(W - 40, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#8a5a2e";
      ctx.beginPath();
      ctx.moveTo(W, H * 0.3);
      ctx.lineTo(W - 80, H * 0.24);
      ctx.lineTo(W - 50, H * 0.42);
      ctx.lineTo(W, H * 0.46);
      ctx.closePath();
      ctx.fill();

      // cliff-top palms (tiny silhouettes)
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(70, H * 0.12 - 18, 3, 18);
      ctx.beginPath();
      ctx.arc(72, H * 0.12 - 22, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(W - 65, H * 0.1 - 20, 3, 20);
      ctx.beginPath();
      ctx.arc(W - 63, H * 0.1 - 24, 10, 0, Math.PI * 2);
      ctx.fill();

      // banner at top
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(80, 30, W - 160, 60);
      ctx.strokeStyle = "#ffd84a"; ctx.lineWidth = 3;
      ctx.strokeRect(80, 30, W - 160, 60);
      ctx.fillStyle = "#ffd84a";
      ctx.font = "bold 30px 'Apple SD Gothic Neo', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("호르무즈 해협", W / 2, 58);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText("STRAIT OF HORMUZ", W / 2, 78);
    } else {
      // Daejeon city — sidewalks + asphalt road
      ctx.fillStyle = "#c9c4b8";
      ctx.fillRect(0, 0, W, H);

      // asphalt road
      ctx.fillStyle = "#2a2c31";
      ctx.fillRect(W * 0.18, 0, W * 0.64, H);

      // curb edges
      ctx.fillStyle = "#8a8578";
      ctx.fillRect(W * 0.18 - 8, 0, 8, H);
      ctx.fillRect(W * 0.82, 0, 8, H);

      // solid white lane edges
      ctx.fillStyle = "#e8e6dd";
      ctx.fillRect(W * 0.2, 0, 4, H);
      ctx.fillRect(W * 0.8 - 4, 0, 4, H);

      // yellow dashed center line
      ctx.fillStyle = "#ffd84a";
      const dash = 60;
      const gap = 60;
      const step = dash + gap;
      for (let y = (state.roadOffset % step) - step; y < H + step; y += step) {
        ctx.fillRect(W / 2 - 5, y, 10, dash);
      }

      // sidewalk tiles
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      for (let y = (state.roadOffset * 0.3 % 40) - 40; y < H + 40; y += 40) {
        ctx.fillRect(20, y, W * 0.18 - 28, 2);
        ctx.fillRect(W - W * 0.18 + 8, y, W * 0.18 - 28, 2);
      }

      // scenery (signs, shops, etc.)
      for (const s of state.scenery) drawScenery(s);
    }

  }

  function drawPlayer() {
    // Top-down (helicopter) view of a wolf running upward.
    // No face details — from directly above you'd see the back + head tip.
    const p = state.player;
    const bob = Math.sin(p.bob * 14) * 2;
    const cx = p.x;
    const cy = PLAYER_Y + bob;

    const FUR = "#c4aa80";
    const FUR_MID = "#967d57";
    const FUR_DARK = "#5a4630";
    const CREAM = "#e8d9b4";
    const PAW = "#28201a";

    // cast shadow on the ground
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(cx + 4, cy + PLAYER_H * 0.55, PLAYER_W * 0.42, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // tail — long bushy plume trailing behind (below body since head faces up)
    const tailSway = Math.sin(p.bob * 10) * 5;
    ctx.fillStyle = FUR_DARK;
    ctx.beginPath();
    ctx.ellipse(cx + tailSway * 0.8, cy + PLAYER_H * 0.55, 12, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = FUR_MID;
    ctx.beginPath();
    ctx.ellipse(cx + tailSway, cy + PLAYER_H * 0.45, 9, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    // tail tip
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.arc(cx + tailSway * 1.2, cy + PLAYER_H * 0.78, 7, 0, Math.PI * 2);
    ctx.fill();

    // hind legs — splayed outward from lower body
    const gait = Math.sin(p.bob * 22);
    ctx.fillStyle = PAW;
    ctx.save();
    ctx.translate(cx - PLAYER_W * 0.32, cy + PLAYER_H * 0.22 + gait * 5);
    ctx.rotate(-0.25);
    roundRect(-6, 0, 12, 26, 5); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(cx + PLAYER_W * 0.32, cy + PLAYER_H * 0.22 - gait * 5);
    ctx.rotate(0.25);
    roundRect(-6, 0, 12, 26, 5); ctx.fill();
    ctx.restore();

    // body (elongated oval along the vertical axis — wolf oriented up)
    const bodyRx = PLAYER_W * 0.38;
    const bodyRy = PLAYER_H * 0.34;
    ctx.fillStyle = FUR;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, bodyRx, bodyRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // saddle — darker stripe along the spine
    ctx.fillStyle = FUR_DARK;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, bodyRx * 0.55, bodyRy * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    // subtle mid-tone band blending saddle into body
    ctx.fillStyle = FUR_MID;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 10, bodyRx * 0.78, bodyRy * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // front legs — splayed outward from upper body
    ctx.fillStyle = PAW;
    ctx.save();
    ctx.translate(cx - PLAYER_W * 0.32, cy - PLAYER_H * 0.08 - gait * 5);
    ctx.rotate(-0.3);
    roundRect(-6, -22, 12, 24, 5); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(cx + PLAYER_W * 0.32, cy - PLAYER_H * 0.08 + gait * 5);
    ctx.rotate(0.3);
    roundRect(-6, -22, 12, 24, 5); ctx.fill();
    ctx.restore();

    // neck — slight taper between body and head
    ctx.fillStyle = FUR;
    ctx.beginPath();
    ctx.ellipse(cx, cy - PLAYER_H * 0.18, bodyRx * 0.58, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = FUR_DARK;
    ctx.beginPath();
    ctx.ellipse(cx, cy - PLAYER_H * 0.18, bodyRx * 0.38, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // head — smaller oval pointing up
    const headCy = cy - PLAYER_H * 0.36;
    ctx.fillStyle = FUR;
    ctx.beginPath();
    ctx.ellipse(cx, headCy, 26, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    // dark top-of-head
    ctx.fillStyle = FUR_DARK;
    ctx.beginPath();
    ctx.ellipse(cx, headCy - 2, 16, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // ears — two pointed triangles on the upper sides of the head
    ctx.fillStyle = FUR_DARK;
    ctx.beginPath();
    ctx.moveTo(cx - 22, headCy - 14);
    ctx.lineTo(cx - 26, headCy - 30);
    ctx.lineTo(cx - 12, headCy - 20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 22, headCy - 14);
    ctx.lineTo(cx + 26, headCy - 30);
    ctx.lineTo(cx + 12, headCy - 20);
    ctx.closePath();
    ctx.fill();
    // ear inner cream
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.moveTo(cx - 20, headCy - 16);
    ctx.lineTo(cx - 23, headCy - 26);
    ctx.lineTo(cx - 14, headCy - 20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 20, headCy - 16);
    ctx.lineTo(cx + 23, headCy - 26);
    ctx.lineTo(cx + 14, headCy - 20);
    ctx.closePath();
    ctx.fill();

    // snout tip — cream wedge pointing up, tiny black nose
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.moveTo(cx - 9, headCy - 18);
    ctx.quadraticCurveTo(cx, headCy - 36, cx + 9, headCy - 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#141410";
    ctx.beginPath();
    ctx.arc(cx, headCy - 30, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSungsimdangBig(s) {
    const x = s.x, y = s.y, w = s.w, h = s.h;
    // mansard roof (dark gray-green metal)
    ctx.fillStyle = "#4a5558";
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 70);
    ctx.lineTo(x + 20, y + 20);
    ctx.lineTo(x + w - 20, y + 20);
    ctx.lineTo(x + w - 8, y + 70);
    ctx.closePath();
    ctx.fill();
    // roof highlight stripes
    ctx.strokeStyle = "#6a7578"; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const ry = y + 30 + i * 10;
      ctx.beginPath();
      ctx.moveTo(x + 14 + i * 2, ry);
      ctx.lineTo(x + w - 14 - i * 2, ry);
      ctx.stroke();
    }
    // dormer windows on roof
    for (let i = 0; i < 2; i++) {
      const dx = x + 32 + i * 56;
      ctx.fillStyle = "#2a2f35";
      roundRect(dx, y + 34, 20, 24, 3); ctx.fill();
      ctx.fillStyle = "#6aa3c6";
      ctx.fillRect(dx + 3, y + 37, 14, 14);
    }
    // turret (right edge)
    ctx.fillStyle = "#4a5558";
    ctx.beginPath();
    ctx.moveTo(x + w - 24, y + 6);
    ctx.lineTo(x + w - 8, y - 20);
    ctx.lineTo(x + w + 4, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8a6a2a";
    ctx.fillRect(x + w - 22, y + 6, 22, 30);
    ctx.fillStyle = "#6aa3c6";
    ctx.fillRect(x + w - 18, y + 12, 14, 16);

    // brick main body
    ctx.fillStyle = "#a84a2a";
    ctx.fillRect(x + 6, y + 70, w - 12, h - 70 - 40);
    // brick texture (horizontal stripes)
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1;
    for (let by = y + 80; by < y + h - 40; by += 8) {
      ctx.beginPath();
      ctx.moveTo(x + 6, by);
      ctx.lineTo(x + w - 6, by);
      ctx.stroke();
    }

    // round stained-glass window (top-center)
    const rwY = y + 100;
    ctx.fillStyle = "#6a3020";
    ctx.beginPath(); ctx.arc(x + w / 2, rwY, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e6b03a";
    ctx.beginPath(); ctx.arc(x + w / 2, rwY, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#6a3020"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 14, rwY); ctx.lineTo(x + w / 2 + 14, rwY);
    ctx.moveTo(x + w / 2, rwY - 14); ctx.lineTo(x + w / 2, rwY + 14);
    ctx.stroke();

    // vertical 선심당 signboard on the facade (bigger/bolder)
    const sbX = x + w - 46;
    const sbY = y + 160;
    ctx.fillStyle = "#1a1a1a";
    roundRect(sbX, sbY, 36, 220, 3); ctx.fill();
    ctx.fillStyle = "#ffd84a";
    ctx.font = "bold 30px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("선", sbX + 18, sbY + 46);
    ctx.fillText("심", sbX + 18, sbY + 108);
    ctx.fillText("당", sbX + 18, sbY + 170);

    // horizontal cream banner across facade (bigger)
    ctx.fillStyle = "#f4ecd8";
    roundRect(x + 14, y + 180, w - 70, 40, 3); ctx.fill();
    ctx.strokeStyle = "#3a2a20"; ctx.lineWidth = 2;
    ctx.strokeRect(x + 14, y + 180, w - 70, 40);
    ctx.fillStyle = "#c2342a";
    ctx.font = "bold 20px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("포장水 40년", x + 14 + (w - 70) / 2, y + 207);

    // arched windows (2 rows of 2, larger for the bigger facade)
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const wx = x + 18 + c * ((w - 80) / 2);
        const wy = y + 250 + r * 80;
        ctx.fillStyle = "#2a2a30";
        ctx.beginPath();
        ctx.moveTo(wx, wy + 56);
        ctx.lineTo(wx, wy + 16);
        ctx.quadraticCurveTo(wx + 16, wy - 6, wx + 32, wy + 16);
        ctx.lineTo(wx + 32, wy + 56);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#e8d8b8";
        ctx.fillRect(wx + 3, wy + 18, 26, 34);
        ctx.strokeStyle = "#3a2a20"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(wx + 16, wy + 14); ctx.lineTo(wx + 16, wy + 54);
        ctx.moveTo(wx + 3, wy + 34); ctx.lineTo(wx + 29, wy + 34);
        ctx.stroke();
      }
    }

    // awnings at bottom (dark gray)
    ctx.fillStyle = "#2a2a30";
    ctx.fillRect(x + 4, y + h - 46, w - 8, 14);
    // awning stripes
    ctx.fillStyle = "#fff4dc";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CAKE BOUTIQUE", x + w / 2, y + h - 36);

    // glass storefront
    ctx.fillStyle = "#f6ecd2";
    ctx.fillRect(x + 4, y + h - 32, w - 8, 22);
    ctx.fillStyle = "#8a6a2a";
    ctx.fillRect(x + w - 26, y + h - 32, 20, 22);
    ctx.fillStyle = "#2a1a10";
    ctx.fillRect(x + w - 24, y + h - 30, 16, 20);

    // sidewalk base
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(x, y + h - 10, w, 10);

    // queue of customers in a vertical line below the storefront
    drawQueue(x + w / 2, y + h + 30);
  }

  function drawQueue(cx, startY) {
    const palettes = [
      { body: "#c64848", head: "#f2c29b", hat: "#2a2a30" },
      { body: "#3c7a4a", head: "#e8b08a", hat: null },
      { body: "#b88a2a", head: "#f2c29b", hat: "#4a2a10" },
      { body: "#2a4a6a", head: "#c48a6a", hat: "#c63030" },
      { body: "#6a3a6a", head: "#f0c0a0", hat: null },
    ];
    const pw = 60;  // per-figure width
    const ph = 90;  // per-figure height
    const gap = 16;
    for (let i = 0; i < palettes.length; i++) {
      const py = startY + i * (ph + gap);
      drawCustomer(cx, py, pw, ph, palettes[i], i);
    }
  }

  function drawCustomer(cx, py, w, h, pal, idx) {
    const bob = Math.sin((idx * 0.9) + state.roadOffset * 0.01) * 1.5;
    const x = cx - w / 2;
    const y = py + bob;
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(cx, y + h - 2, w * 0.38, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // legs
    ctx.fillStyle = "#222";
    roundRect(cx - 10, y + h * 0.72, 8, h * 0.28, 3); ctx.fill();
    roundRect(cx + 2, y + h * 0.72, 8, h * 0.28, 3); ctx.fill();
    // body (t-shirt)
    ctx.fillStyle = pal.body;
    roundRect(cx - w * 0.36, y + h * 0.32, w * 0.72, h * 0.44, 8); ctx.fill();
    // arms
    ctx.fillStyle = pal.body;
    roundRect(cx - w * 0.5, y + h * 0.34, w * 0.18, h * 0.34, 6); ctx.fill();
    roundRect(cx + w * 0.32, y + h * 0.34, w * 0.18, h * 0.34, 6); ctx.fill();
    // hands
    ctx.fillStyle = pal.head;
    ctx.beginPath();
    ctx.arc(cx - w * 0.41, y + h * 0.7, 5, 0, Math.PI * 2);
    ctx.arc(cx + w * 0.41, y + h * 0.7, 5, 0, Math.PI * 2);
    ctx.fill();
    // shopping bag (selected ones)
    if (idx % 2 === 0) {
      ctx.fillStyle = "#f4d96a";
      roundRect(cx + w * 0.38, y + h * 0.66, 12, 14, 2); ctx.fill();
      ctx.strokeStyle = "#c69a20"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.4, y + h * 0.66);
      ctx.quadraticCurveTo(cx + w * 0.44, y + h * 0.6, cx + w * 0.48, y + h * 0.66);
      ctx.stroke();
    }
    // head
    ctx.fillStyle = pal.head;
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.18, 13, 0, Math.PI * 2);
    ctx.fill();
    // hair or hat
    if (pal.hat) {
      ctx.fillStyle = pal.hat;
      ctx.beginPath();
      ctx.arc(cx, y + h * 0.12, 13, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(cx - 15, y + h * 0.12, 30, 3);
    } else {
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(cx, y + h * 0.12, 13, Math.PI, 0);
      ctx.fill();
    }
    // eyes
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(cx - 4, y + h * 0.2, 1.5, 0, Math.PI * 2);
    ctx.arc(cx + 4, y + h * 0.2, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStadiumBig(s) {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const rx = s.w / 2;
    const ry = s.h / 2;
    // outer concrete ring (warm tan)
    ctx.fillStyle = "#a88a6a";
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    // seating bowl (orange-forward team colorway)
    ctx.fillStyle = "#e06a1a";
    ctx.beginPath(); ctx.ellipse(cx, cy, rx - 10, ry - 10, 0, 0, Math.PI * 2); ctx.fill();
    // alternating dark-orange tier band
    ctx.fillStyle = "#b04a10";
    ctx.beginPath(); ctx.ellipse(cx, cy, rx - 18, ry - 18, 0, 0, Math.PI * 2); ctx.fill();
    // bright orange top tier (closest to the field)
    ctx.fillStyle = "#ff8a30";
    ctx.beginPath(); ctx.ellipse(cx, cy, rx - 28, ry - 28, 0, 0, Math.PI * 2); ctx.fill();
    // thin seat-row scribes
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx - 14 - i * 4, ry - 14 - i * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // outfield grass (inner green)
    ctx.fillStyle = "#3d7a3d";
    ctx.beginPath(); ctx.ellipse(cx, cy, rx - 38, ry - 38, 0, 0, Math.PI * 2); ctx.fill();
    // mowing stripes
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 6;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 14, cy - ry + 40);
      ctx.lineTo(cx + i * 14, cy + ry - 40);
      ctx.stroke();
    }
    // warning track (orange ring at edge of grass)
    ctx.strokeStyle = "#c88a4a"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx - 38, ry - 38, 0, 0, Math.PI * 2); ctx.stroke();
    // infield diamond (clay)
    ctx.fillStyle = "#c27a3a";
    ctx.save();
    ctx.translate(cx, cy + ry * 0.2);
    ctx.rotate(Math.PI / 4);
    const sq = Math.min(rx, ry) * 0.55;
    ctx.fillRect(-sq / 2, -sq / 2, sq, sq);
    ctx.restore();
    // bases
    ctx.fillStyle = "#ffffff";
    const baseR = 4;
    const bases = [
      { dx: 0, dy: ry * 0.2 + 38 },    // home
      { dx: 34, dy: ry * 0.2 + 4 },    // first
      { dx: 0, dy: ry * 0.2 - 30 },    // second
      { dx: -34, dy: ry * 0.2 + 4 },   // third
    ];
    for (const b of bases) {
      ctx.beginPath();
      ctx.arc(cx + b.dx, cy + b.dy, baseR, 0, Math.PI * 2);
      ctx.fill();
    }
    // pitcher's mound
    ctx.fillStyle = "#d68a4a";
    ctx.beginPath();
    ctx.arc(cx, cy + ry * 0.2 + 4, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - 2, cy + ry * 0.2 + 2, 4, 4);

    // scoreboard on the near edge of the ring (larger)
    const sbSide = s.side === "L" ? 1 : -1; // face toward the road side
    const sbx = cx + sbSide * (rx - 44);
    const sby = cy - ry * 0.55;
    ctx.fillStyle = "#1a1a1a";
    roundRect(sbx - 36, sby - 24, 72, 50, 4); ctx.fill();
    ctx.fillStyle = "#ff7a2a";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SCORE", sbx, sby - 6);
    ctx.fillStyle = "#ffd84a";
    ctx.font = "bold 20px 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText("1 : 0", sbx, sby + 18);

    // stadium light tower (tall post with light cluster)
    const ltx = cx + sbSide * (rx - 14);
    const lty = cy + ry * 0.4;
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(ltx - 1, lty - 30, 2, 30);
    ctx.fillStyle = "#f5e88a";
    roundRect(ltx - 8, lty - 42, 16, 12, 2); ctx.fill();
    ctx.fillStyle = "#ffffff";
    for (let ix = 0; ix < 3; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        ctx.fillRect(ltx - 7 + ix * 5, lty - 40 + iy * 5, 3, 3);
      }
    }

    // team banner on the bowl edge (larger & bolder)
    const bnw = 230;
    const bnh = 34;
    const bnx = cx - bnw / 2;
    const bny = cy + ry - bnh - 10;
    ctx.fillStyle = "#ffffff";
    roundRect(bnx - 3, bny - 3, bnw + 6, bnh + 6, 6); ctx.fill();
    ctx.fillStyle = "#ff7a2a";
    roundRect(bnx, bny, bnw, bnh, 5); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("하나 이겼으 파크", cx, bny + bnh / 2);
    ctx.textBaseline = "alphabetic";

    // tiny spectators as dots around the rim
    ctx.fillStyle = "#ff7a2a";
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      const r = rx - 20;
      const ry2 = ry - 20;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * ry2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawZooGate(s) {
    const x = s.x, y = s.y, w = s.w, h = s.h;
    // ground/plaza behind the gate
    ctx.fillStyle = "#8a8268";
    ctx.fillRect(x, y + h - 80, w, 80);
    // cage compound behind (dark bars over field of animal dots)
    ctx.fillStyle = "#2a4a2a";
    ctx.fillRect(x, y, w, h - 80);
    // tiny enclosure structures / cages in the background
    ctx.fillStyle = "#6a5a3a";
    for (let i = 0; i < 6; i++) {
      const bx = x + 30 + i * ((w - 60) / 6);
      ctx.fillRect(bx, y + 40, 40, 40);
      // bar lines
      ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 1;
      for (let b = 0; b < 5; b++) {
        ctx.beginPath();
        ctx.moveTo(bx + 4 + b * 8, y + 44);
        ctx.lineTo(bx + 4 + b * 8, y + 76);
        ctx.stroke();
      }
    }
    // gate side pillars
    ctx.fillStyle = "#4a3528";
    ctx.fillRect(x + W * 0.16, y + h - 180, 22, 180);
    ctx.fillRect(x + W * 0.82 - 22, y + h - 180, 22, 180);
    // pillar caps
    ctx.fillStyle = "#6a4a38";
    ctx.fillRect(x + W * 0.16 - 4, y + h - 190, 30, 14);
    ctx.fillRect(x + W * 0.82 - 26, y + h - 190, 30, 14);
    // arch beam
    ctx.fillStyle = "#4a3528";
    ctx.fillRect(x + W * 0.16, y + h - 200, W * 0.66, 26);
    // arch sign (cream background, big "동물원")
    ctx.fillStyle = "#f6ecd2";
    roundRect(x + W * 0.22, y + h - 198, W * 0.56, 22, 3);
    ctx.fill();
    ctx.strokeStyle = "#4a3528"; ctx.lineWidth = 2;
    ctx.strokeRect(x + W * 0.22, y + h - 198, W * 0.56, 22);
    ctx.fillStyle = "#2a1a10";
    ctx.font = "bold 22px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("동물원", x + W / 2, y + h - 181);
    // entrance (the gap between pillars)
    ctx.fillStyle = "#3a3036";
    ctx.fillRect(x + W * 0.18 + 22, y + h - 174, W * 0.64 - 44, 174);
    // broken cage door (askew) — the wolf left this way
    ctx.fillStyle = "#2a2a30";
    ctx.save();
    ctx.translate(x + W * 0.5 - 30, y + h - 140);
    ctx.rotate(-0.28);
    ctx.fillRect(0, 0, 60, 90);
    // bars
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(6 + i * 12, 4);
      ctx.lineTo(6 + i * 12, 86);
      ctx.stroke();
    }
    ctx.restore();
    // "탈출!" spray on gate
    ctx.fillStyle = "#d62a2a";
    ctx.font = "bold 26px 'Apple SD Gothic Neo', sans-serif";
    ctx.save();
    ctx.translate(x + W * 0.32, y + h - 40);
    ctx.rotate(-0.12);
    ctx.fillText("탈출!", 0, 0);
    ctx.restore();

    // dug tunnel + dirt mound near the right pillar — escape by digging
    const tx = x + W * 0.72;
    const ty = y + h - 18;
    // dirt mound (piled to the side)
    ctx.fillStyle = "#5a3a20";
    ctx.beginPath();
    ctx.moveTo(tx + 30, ty + 4);
    ctx.quadraticCurveTo(tx + 60, ty - 22, tx + 90, ty + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7a4a28";
    ctx.beginPath();
    ctx.moveTo(tx + 42, ty + 4);
    ctx.quadraticCurveTo(tx + 60, ty - 14, tx + 78, ty + 4);
    ctx.closePath();
    ctx.fill();
    // little dirt specks
    ctx.fillStyle = "#3a2414";
    ctx.fillRect(tx + 24, ty + 2, 4, 3);
    ctx.fillRect(tx + 96, ty + 2, 3, 3);
    ctx.fillRect(tx + 54, ty - 18, 3, 3);
    // tunnel mouth under the fence
    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    ctx.ellipse(tx, ty, 22, 10, 0, Math.PI, Math.PI * 2);
    ctx.lineTo(tx + 22, ty + 4);
    ctx.lineTo(tx - 22, ty + 4);
    ctx.closePath();
    ctx.fill();
    // paw prints leading from the tunnel
    ctx.fillStyle = "#3a2414";
    for (let i = 0; i < 3; i++) {
      const pxp = tx - 26 - i * 24;
      const pyp = ty + 8 + i * 4;
      ctx.beginPath(); ctx.arc(pxp, pyp, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pxp - 6, pyp + 4, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawScenery(s) {
    if (s.kind === "zoo_gate") {
      drawZooGate(s);
    } else if (s.kind === "sungsimdang_big") {
      drawSungsimdangBig(s);
    } else if (s.kind === "stadium_big") {
      drawStadiumBig(s);
    } else if (s.kind === "sign") {
      // green street sign on pole
      ctx.fillStyle = "#4a4a4a";
      ctx.fillRect(s.x + s.w / 2 - 3, s.y + 40, 6, s.h - 40);
      ctx.fillStyle = "#1f6f3e";
      roundRect(s.x, s.y, s.w, 46, 4); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 3, s.y + 3, s.w - 6, 40);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px 'Apple SD Gothic Neo', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.label, s.x + s.w / 2, s.y + 28);
    } else if (s.kind === "building") {
      // generic storefront
      ctx.fillStyle = "#c8b8a0";
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = "#5a5040";
      ctx.fillRect(s.x, s.y, s.w, 18);
      // windows
      ctx.fillStyle = "#6a8ea0";
      const cols = 3, rows = Math.max(2, Math.floor((s.h - 26) / 28));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillRect(
            s.x + 10 + c * ((s.w - 20) / cols),
            s.y + 26 + r * 28,
            (s.w - 20) / cols - 6,
            20
          );
        }
      }
    } else {
      // tree
      ctx.fillStyle = "#2d4a25";
      ctx.beginPath();
      ctx.arc(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a6030";
      ctx.beginPath();
      ctx.arc(s.x + s.w / 2 - 8, s.y + s.h / 2 - 6, s.w / 2 - 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPerson(o) {
    const cx = o.x + o.w / 2;
    const y = o.y;
    const h = o.h;
    let uniform = "#7a6a3e", cap = "#4a5c2e", accent = "#d4c18b";
    let label = null;
    if (o.sub === "police") {
      uniform = "#1b2c48"; cap = "#0f1a30"; accent = "#e8c547"; label = "POLICE";
    } else if (o.sub === "rescue") {
      uniform = "#e0742a"; cap = "#ffffff"; accent = "#d62a2a"; label = "119";
    } else {
      label = "동물원";
    }
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(cx, y + h - 4, o.w * 0.4, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // legs
    ctx.fillStyle = "#222";
    roundRect(cx - 18, y + h * 0.7, 14, h * 0.28, 4); ctx.fill();
    roundRect(cx + 4, y + h * 0.7, 14, h * 0.28, 4); ctx.fill();
    // body
    ctx.fillStyle = uniform;
    roundRect(cx - o.w * 0.4, y + h * 0.3, o.w * 0.8, h * 0.45, 10); ctx.fill();
    // belt
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(cx - o.w * 0.4, y + h * 0.65, o.w * 0.8, 6);
    // arms extended (trying to catch)
    ctx.fillStyle = uniform;
    roundRect(cx - o.w * 0.58, y + h * 0.32, 18, h * 0.35, 8); ctx.fill();
    roundRect(cx + o.w * 0.58 - 18, y + h * 0.32, 18, h * 0.35, 8); ctx.fill();
    // hands
    ctx.fillStyle = "#f2c29b";
    ctx.beginPath();
    ctx.arc(cx - o.w * 0.58 + 9, y + h * 0.67, 10, 0, Math.PI * 2);
    ctx.arc(cx + o.w * 0.58 - 9, y + h * 0.67, 10, 0, Math.PI * 2);
    ctx.fill();
    // chest label badge
    if (label) {
      ctx.fillStyle = accent;
      roundRect(cx - 22, y + h * 0.42, 44, 16, 3); ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, cx, y + h * 0.42 + 12);
    }
    // head
    ctx.fillStyle = "#f2c29b";
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.2, 22, 0, Math.PI * 2);
    ctx.fill();
    // cap
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.14, 22, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - 22, y + h * 0.14, 44, 6);
    // cap brim
    ctx.fillStyle = "#111";
    ctx.fillRect(cx - 26, y + h * 0.14 + 4, 52, 4);
    // cap emblem
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.08, 4, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(cx - 6, y + h * 0.22, 2, 0, Math.PI * 2);
    ctx.arc(cx + 6, y + h * 0.22, 2, 0, Math.PI * 2);
    ctx.fill();
    // mouth (determined line)
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, y + h * 0.26);
    ctx.lineTo(cx + 5, y + h * 0.26);
    ctx.stroke();
  }

  function drawBullet(bt) {
    ctx.save();
    ctx.translate(bt.x, bt.y);
    ctx.rotate(bt.spin);
    // coin outer
    ctx.fillStyle = "#e0a817";
    ctx.beginPath();
    ctx.arc(0, 0, bt.r, 0, Math.PI * 2);
    ctx.fill();
    // inner rim
    ctx.fillStyle = "#f7d34a";
    ctx.beginPath();
    ctx.arc(0, 0, bt.r - 4, 0, Math.PI * 2);
    ctx.fill();
    // edge darker
    ctx.strokeStyle = "#8a5a0a"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, bt.r - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // text (not rotated — always readable)
    ctx.fillStyle = "#7a3a0a";
    ctx.font = "bold 18px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("관세", bt.x, bt.y);
    ctx.textBaseline = "alphabetic";
  }

  function drawObstacle(o) {
    if (o.type === 0) {
      drawPerson(o);
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
      // ♀ symbol floating above head
      const sy = cy - 78 + Math.sin(performance.now() / 300 + o.phase) * 4;
      ctx.fillStyle = "#ff3f80";
      ctx.beginPath();
      ctx.arc(cx, sy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, sy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ff3f80"; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, sy, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, sy + 7); ctx.lineTo(cx, sy + 18);
      ctx.moveTo(cx - 5, sy + 13); ctx.lineTo(cx + 5, sy + 13);
      ctx.stroke();
    } else if (o.type === 4) {
      drawTanker(o);
    }
  }

  function drawStraitFleet() {
    // five horizontal tankers arranged across the water, with parallax drift
    const rows = [
      { y: H * 0.60, scale: 1.00, speed: 22 },
      { y: H * 0.68, scale: 0.86, speed: 14 },
      { y: H * 0.76, scale: 0.70, speed: 8 },
    ];
    const fleet = [
      { row: 0, color: "#141820", tank: "#e07a2a", offset: 0,   flip: false },
      { row: 0, color: "#1a1a22", tank: "#f2962e", offset: 300, flip: true },
      { row: 1, color: "#1a1a22", tank: "#d66a2a", offset: 140, flip: false },
      { row: 1, color: "#141820", tank: "#e07a2a", offset: 500, flip: true },
      { row: 2, color: "#232830", tank: "#d4842a", offset: 60,  flip: false },
      { row: 2, color: "#1a1a22", tank: "#c67020", offset: 380, flip: true },
    ];
    for (const s of fleet) {
      const r = rows[s.row];
      const len = 160 * r.scale;
      const ht = 34 * r.scale;
      const travel = (W + len + 200);
      const raw = (state.phaseT * r.speed + s.offset) % travel;
      const x = raw - len - 100;
      drawTankerSide(x, r.y, len, ht, s.flip, s.color, s.tank);
    }
  }

  function drawTankerSide(x, y, w, h, flip, hullColor, tankColor) {
    ctx.save();
    if (flip) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.translate(-x, -y);
    }
    // wake behind
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(x + w + 6, y + h * 0.5);
    ctx.lineTo(x + w + 34, y + h * 0.2);
    ctx.lineTo(x + w + 34, y + h * 0.8);
    ctx.closePath();
    ctx.fill();
    // hull (side view: flat deck on top, angled stern right, pointed bow left)
    ctx.fillStyle = hullColor;
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.55);       // bow tip
    ctx.lineTo(x + w * 0.1, y);         // up to deck
    ctx.lineTo(x + w, y);               // deck back
    ctx.lineTo(x + w, y + h);           // stern bottom
    ctx.lineTo(x + w * 0.08, y + h);    // hull bottom to bow
    ctx.closePath();
    ctx.fill();
    // hull waterline stripe
    ctx.fillStyle = "#c63030";
    ctx.fillRect(x + w * 0.08, y + h * 0.78, w * 0.9, Math.max(2, h * 0.08));
    // deck tanks (horizontal cylinders)
    ctx.fillStyle = tankColor;
    const tanks = 4;
    const tW = (w * 0.65) / tanks;
    for (let i = 0; i < tanks; i++) {
      const tx = x + w * 0.15 + i * tW;
      roundRect(tx, y - h * 0.3, tW - 4, h * 0.4, h * 0.15);
      ctx.fill();
    }
    // pipework
    ctx.strokeStyle = "#555"; ctx.lineWidth = Math.max(1, h * 0.08);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.15, y - h * 0.1);
    ctx.lineTo(x + w * 0.82, y - h * 0.1);
    ctx.stroke();
    // bridge + stack at stern
    ctx.fillStyle = "#e8e0c8";
    ctx.fillRect(x + w * 0.82, y - h * 0.7, w * 0.16, h * 0.7);
    ctx.fillStyle = "#6aa3c6";
    ctx.fillRect(x + w * 0.84, y - h * 0.55, w * 0.12, h * 0.2);
    ctx.fillStyle = "#c62020";
    ctx.fillRect(x + w * 0.88, y - h * 1.0, w * 0.07, h * 0.35);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(x + w * 0.87, y - h * 1.05, w * 0.09, h * 0.06);
    ctx.restore();
  }

  function drawTanker(o) {
    // vertical top-down ship: pointy bow at top, bridge/stack at bottom
    const x = o.x, y = o.y, w = o.w, h = o.h;
    const cxT = x + w / 2;

    // bow wake (V-shape ahead of the ship)
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.moveTo(cxT, y - 6);
    ctx.lineTo(cxT - 26, y - 34);
    ctx.lineTo(cxT, y - 16);
    ctx.lineTo(cxT + 26, y - 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.ellipse(cxT, y + 6, w / 2 + 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // hull (pointy bow, rounded stern)
    ctx.fillStyle = "#1a1f28";
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 36);
    ctx.quadraticCurveTo(cxT, y - 14, x + w - 4, y + 36);
    ctx.lineTo(x + w - 2, y + h - 10);
    ctx.quadraticCurveTo(cxT, y + h + 4, x + 2, y + h - 10);
    ctx.closePath();
    ctx.fill();

    // deck surface
    ctx.fillStyle = "#d4a070";
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 44);
    ctx.quadraticCurveTo(cxT, y + 6, x + w - 12, y + 44);
    ctx.lineTo(x + w - 10, y + h - 38);
    ctx.lineTo(x + 10, y + h - 38);
    ctx.closePath();
    ctx.fill();

    // center pipe running bow-to-stern
    ctx.strokeStyle = "#6a6a6a"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cxT, y + 50);
    ctx.lineTo(cxT, y + h - 44);
    ctx.stroke();

    // oil tanks (4 big orange circles down the deck)
    const tankCount = 4;
    for (let i = 0; i < tankCount; i++) {
      const ty = y + 60 + i * ((h - 110) / (tankCount - 1));
      ctx.fillStyle = "#ff8a2a";
      ctx.beginPath();
      ctx.arc(cxT, ty, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8a4a10"; ctx.lineWidth = 2;
      ctx.stroke();
      // rivet highlight
      ctx.fillStyle = "#ffd08a";
      ctx.beginPath();
      ctx.arc(cxT - 5, ty - 5, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // bridge/superstructure at stern
    ctx.fillStyle = "#e8e0c8";
    roundRect(x + 20, y + h - 36, w - 40, 22, 4); ctx.fill();
    ctx.fillStyle = "#6aa3c6";
    ctx.fillRect(x + 26, y + h - 32, w - 52, 7);

    // red smokestack
    ctx.fillStyle = "#c62020";
    ctx.fillRect(cxT - 7, y + h - 22, 14, 16);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(cxT - 8, y + h - 23, 16, 4);

    // hull side stripe
    ctx.fillStyle = "#ffd84a";
    ctx.fillRect(x + 8, y + h * 0.58, w - 16, 8);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.strokeRect(x + 8, y + h * 0.58, w - 16, 8);
  }

  function drawBoss() {
    const b = state.boss;
    if (!b) return;
    ctx.save();
    const cx = b.x;
    let y = b.y;
    if (b.dead) {
      // rotate + wobble during fall
      const rot = Math.min(b.deadT * 2.2, Math.PI);
      ctx.translate(b.x, b.y + b.h * 0.5);
      ctx.rotate(rot);
      ctx.translate(-b.x, -(b.y + b.h * 0.5));
    }
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
    // signature swoop pompadour (oversized, volume swept to one side)
    ctx.fillStyle = "#f6b84a";
    ctx.beginPath();
    ctx.moveTo(cx - 94, y + b.h * 0.34);
    ctx.quadraticCurveTo(cx - 90, y - 30, cx - 20, y - 8);
    ctx.quadraticCurveTo(cx + 60, y - 20, cx + 110, y + 16);
    ctx.quadraticCurveTo(cx + 120, y + b.h * 0.22, cx + 88, y + b.h * 0.3);
    ctx.quadraticCurveTo(cx + 20, y + b.h * 0.18, cx - 94, y + b.h * 0.34);
    ctx.fill();
    // darker undertones — strand highlights
    ctx.fillStyle = "#c6882a";
    ctx.beginPath();
    ctx.moveTo(cx - 50, y + b.h * 0.22);
    ctx.quadraticCurveTo(cx + 20, y + b.h * 0.08, cx + 80, y + b.h * 0.2);
    ctx.quadraticCurveTo(cx + 40, y + b.h * 0.24, cx - 50, y + b.h * 0.22);
    ctx.fill();
    // light strand highlight on top
    ctx.fillStyle = "#ffd88a";
    ctx.beginPath();
    ctx.moveTo(cx - 40, y + b.h * 0.08);
    ctx.quadraticCurveTo(cx + 30, y - 4, cx + 70, y + b.h * 0.06);
    ctx.quadraticCurveTo(cx + 30, y + b.h * 0.14, cx - 40, y + b.h * 0.08);
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
    // arms out (blocking)
    ctx.fillStyle = "#1b2a48";
    roundRect(cx - b.w / 2 - 10, y + b.h * 0.55, 70, 40, 14);
    ctx.fill();
    roundRect(cx + b.w / 2 - 60, y + b.h * 0.55, 70, 40, 14);
    ctx.fill();
    ctx.fillStyle = "#f2a56a";
    ctx.beginPath(); ctx.arc(cx - b.w / 2 - 6, y + b.h * 0.75, 22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + b.w / 2 + 6, y + b.h * 0.75, 22, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // death flash + stars above (drawn in screen space, not rotated)
    if (b.dead) {
      const pt = b.deadT;
      if (pt < 0.3) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 0.7 - pt * 2)})`;
        ctx.fillRect(0, 0, W, H);
      }
      // stars orbit the head during the hover
      if (pt < 0.5) {
        const headY = b.y + b.h * 0.4;
        ctx.fillStyle = "#ffd84a";
        ctx.font = "bold 34px sans-serif";
        ctx.textAlign = "center";
        for (let i = 0; i < 5; i++) {
          const a = pt * 8 + i * (Math.PI * 2 / 5);
          const sx = b.x + Math.cos(a) * 90;
          const sy = headY + Math.sin(a) * 30;
          ctx.fillText("★", sx, sy);
        }
      }
    }
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
    ctx.fillText("최종 관문 — 도람뿌 등장!", W / 2, H * 0.53);
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
    for (const bt of state.bullets) drawBullet(bt);
    drawBossAnnounce();
    if (state.reveal) drawReveal();
    ctx.restore();
  }

  function drawReveal() {
    const r = state.reveal;
    const t = r.t;
    // darken background
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.55, t * 1.5)})`;
    ctx.fillRect(0, 0, W, H);
    // phase A (0..0.35): big ♀ bouncing
    // phase B (0.35..0.55): quick shrink + flash
    // phase C (0.55..0.9): ♂ growing with 충격 lines
    if (t < 0.35) {
      const scale = 1 + Math.sin(t * 18) * 0.08;
      const sz = 88 * scale;
      drawFemaleGlyph(r.x, r.y - 40, sz, "#ff3f80");
    } else if (t < 0.55) {
      // white flash
      ctx.fillStyle = `rgba(255,255,255,${1 - (t - 0.35) * 4})`;
      ctx.fillRect(0, 0, W, H);
    } else {
      const grow = Math.min(1, (t - 0.55) * 4);
      const sz = 60 + grow * 80;
      // shock lines
      ctx.strokeStyle = `rgba(255,220,80,${grow})`;
      ctx.lineWidth = 4;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r1 = sz + 20;
        const r2 = sz + 60 + Math.sin(t * 20 + i) * 6;
        ctx.beginPath();
        ctx.moveTo(r.x + Math.cos(a) * r1, r.y - 40 + Math.sin(a) * r1);
        ctx.lineTo(r.x + Math.cos(a) * r2, r.y - 40 + Math.sin(a) * r2);
        ctx.stroke();
      }
      drawMaleGlyph(r.x, r.y - 40, sz, "#1e88e5");
      // '수컷!' shout
      ctx.fillStyle = "#ffd84a";
      ctx.font = `bold ${Math.floor(40 + grow * 30)}px 'Apple SD Gothic Neo', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("수컷!", r.x, r.y + 80);
    }
  }

  function drawFemaleGlyph(cx, cy, size, color) {
    const rIn = size * 0.38;
    ctx.lineWidth = Math.max(6, size * 0.1);
    // circle
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy - rIn * 0.4, rIn, 0, Math.PI * 2);
    ctx.stroke();
    // cross below
    ctx.beginPath();
    ctx.moveTo(cx, cy + rIn * 0.6); ctx.lineTo(cx, cy + rIn * 1.6);
    ctx.moveTo(cx - rIn * 0.5, cy + rIn * 1.15); ctx.lineTo(cx + rIn * 0.5, cy + rIn * 1.15);
    ctx.stroke();
  }

  function drawMaleGlyph(cx, cy, size, color) {
    const rIn = size * 0.38;
    ctx.lineWidth = Math.max(6, size * 0.1);
    ctx.strokeStyle = color;
    // circle offset lower-left
    ctx.beginPath();
    ctx.arc(cx - rIn * 0.25, cy + rIn * 0.25, rIn, 0, Math.PI * 2);
    ctx.stroke();
    // arrow up-right
    const ax1 = cx + rIn * 0.35, ay1 = cy - rIn * 0.35;
    const ax2 = cx + rIn * 1.15, ay2 = cy - rIn * 1.15;
    ctx.beginPath();
    ctx.moveTo(ax1, ay1);
    ctx.lineTo(ax2, ay2);
    ctx.stroke();
    // arrow head
    ctx.beginPath();
    ctx.moveTo(ax2, ay2);
    ctx.lineTo(ax2 - rIn * 0.4, ay2 + rIn * 0.08);
    ctx.moveTo(ax2, ay2);
    ctx.lineTo(ax2 - rIn * 0.08, ay2 + rIn * 0.4);
    ctx.stroke();
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
  document.getElementById("credits-restart-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    creditsOverlay.classList.add("hidden");
    start();
  });

  state.scenery = seedScenery();
  render();
})();
