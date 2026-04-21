(() => {
  // 프리뷰/개발 환경 식별 — 호스트가 운영 도메인이 아니면 배지 + 탭 제목 표시
  const PROD_HOST = "neukgu-run.pages.dev";
  const IS_PREVIEW = typeof window !== "undefined" && window.location.hostname !== PROD_HOST;
  if (IS_PREVIEW) {
    const badge = document.createElement("div");
    badge.className = "preview-badge";
    badge.textContent = "🚧 PREVIEW";
    if (document.body) {
      document.body.appendChild(badge);
    } else {
      document.addEventListener("DOMContentLoaded", () => document.body.appendChild(badge));
    }
    document.title = "[PREVIEW] " + document.title;
    // 파비콘 / 홈스크린 아이콘을 프리뷰 전용으로 교체 (메인 앱 아이콘과 구분)
    const swapIconHrefs = () => {
      document.querySelectorAll(
        'link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]'
      ).forEach((el) => {
        el.href = "icon-preview.svg";
      });
    };
    swapIconHrefs();
    document.addEventListener("DOMContentLoaded", swapIconHrefs);
  }

  const W = 720;
  const H = 1280;

  const PLAYER_W = 110;
  const PLAYER_H = 130;
  const PLAYER_Y = 1060;
  const PLAYER_MARGIN = 30;

  const SCROLL_START = 300;
  const SCROLL_MAX = 1000;
  const SCROLL_ACCEL = 8;
  const SCROLL_RAMP_DIST = 9000;

  const OBS_W = 120;
  const OBS_H = 130;
  const SPAWN_MIN = 1.35;
  const SPAWN_MAX = 2.60;

  const NET_UNLOCK_DIST = 4000;   // 25% — 포획반(그물) 등장
  const VET_UNLOCK_DIST = 8000;   // 50% — 수의사(마취총) 등장

  const STEER_SPEED = 1800;

  const BEST_KEY = "neukgurun.best";
  const MUTE_KEY = "neukgurun.muted";

  // --- audio (Web Audio API — 보수적 볼륨, 사용자 놀라지 않게) ---
  const audio = (() => {
    let ctx = null;
    let master = null;
    let musicGain = null;
    let sfxGain = null;
    let muted = localStorage.getItem(MUTE_KEY) === "1";
    let bgmTimer = null;
    let bgmStep = 0;
    let bgmTrack = null;

    const MASTER_VOL = 0.42; // 전체 캡: 부드럽게
    const MUSIC_VOL = 0.7;   // 음악은 배경으로
    const SFX_VOL = 1.0;

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : MASTER_VOL;
        master.connect(ctx.destination);
        sfxGain = ctx.createGain();
        sfxGain.gain.value = SFX_VOL;
        sfxGain.connect(master);
        musicGain = ctx.createGain();
        musicGain.gain.value = 0;
        musicGain.connect(master);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function isMuted() { return muted; }
    function setMuted(v) {
      muted = !!v;
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
      if (master) master.gain.value = muted ? 0 : MASTER_VOL;
    }

    function tone(freq, dur, opts) {
      if (!ctx) return;
      opts = opts || {};
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = opts.type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
      }
      const vol = opts.vol != null ? opts.vol : 0.15;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + (opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(opts.bus || sfxGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    function noise(dur, opts) {
      if (!ctx) return;
      opts = opts || {};
      const t0 = ctx.currentTime;
      const bufSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = opts.filterType || "lowpass";
      filt.frequency.value = opts.filterFreq || 800;
      const g = ctx.createGain();
      const vol = opts.vol != null ? opts.vol : 0.12;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filt); filt.connect(g); g.connect(opts.bus || sfxGain);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    }

    function kick(when, vol, bus) {
      if (!ctx) return;
      vol = vol != null ? vol : 0.1;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, when);
      osc.frequency.exponentialRampToValueAtTime(40, when + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
      osc.connect(g);
      g.connect(bus || musicGain);
      osc.start(when);
      osc.stop(when + 0.2);
    }

    const sfx = {
      pickup() {
        tone(784, 0.08, { type: "triangle", vol: 0.14 });
        setTimeout(() => tone(1175, 0.12, { type: "triangle", vol: 0.14 }), 55);
      },
      net() {
        tone(220, 0.22, { type: "sawtooth", slideTo: 110, vol: 0.1 });
        noise(0.18, { filterFreq: 500, vol: 0.07 });
      },
      dart() {
        tone(900, 0.08, { type: "square", slideTo: 660, vol: 0.12 });
        noise(0.05, { filterType: "highpass", filterFreq: 3000, vol: 0.08 });
      },
      gorani() {
        tone(140, 0.22, { type: "sawtooth", slideTo: 80, vol: 0.14 });
        noise(0.2, { filterFreq: 1200, vol: 0.12 });
      },
      tanker() {
        tone(70, 0.5, { type: "triangle", slideTo: 45, vol: 0.18 });
        noise(0.45, { filterFreq: 280, vol: 0.1 });
      },
      bossWarn() {
        tone(660, 0.1, { type: "square", vol: 0.12 });
        setTimeout(() => tone(660, 0.1, { type: "square", vol: 0.12 }), 180);
        setTimeout(() => tone(880, 0.22, { type: "square", vol: 0.12 }), 360);
      },
      siren() {
        // 짧은 사이렌 — 주파수 위아래 스윕을 두 번 반복
        tone(520, 0.22, { type: "sawtooth", slideTo: 880, vol: 0.12 });
        setTimeout(() => tone(880, 0.22, { type: "sawtooth", slideTo: 520, vol: 0.12 }), 220);
        setTimeout(() => tone(520, 0.22, { type: "sawtooth", slideTo: 880, vol: 0.12 }), 440);
        setTimeout(() => tone(880, 0.26, { type: "sawtooth", slideTo: 520, vol: 0.12 }), 660);
      },
      gameOver() {
        tone(349, 0.14, { type: "sawtooth", vol: 0.14 });
        setTimeout(() => tone(294, 0.14, { type: "sawtooth", vol: 0.14 }), 140);
        setTimeout(() => tone(220, 0.34, { type: "sawtooth", vol: 0.14 }), 280);
      },
      victory() {
        // 스테이지 클리어 팡파르: 상행 아르페지오 + 마무리 코드
        const TRI = "triangle", SQ = "square";
        const notes = [
          [0,   523, 0.12, TRI, 0.18], // C5
          [0,   262, 0.12, SQ,  0.09], // C4 bass
          [130, 659, 0.12, TRI, 0.18], // E5
          [130, 330, 0.12, SQ,  0.09],
          [260, 784, 0.12, TRI, 0.18], // G5
          [260, 392, 0.12, SQ,  0.09],
          [390, 1047, 0.14, TRI, 0.2], // C6
          [390, 523, 0.14, SQ,  0.1],
          [560, 988, 0.1, TRI, 0.16], // B5
          [670, 1047, 0.1, TRI, 0.16], // C6
          [780, 1175, 0.1, TRI, 0.16], // D6
          [890, 1319, 0.14, TRI, 0.18], // E6
          // final held C major triad
          [1050, 1047, 0.9, TRI, 0.2],
          [1050, 1319, 0.9, TRI, 0.15],
          [1050, 1568, 0.9, SQ,  0.09],
          [1050, 523,  0.9, SQ,  0.1],
        ];
        for (const [delay, f, d, t, v] of notes) {
          setTimeout(() => tone(f, d, { type: t, vol: v }), delay);
        }
        if (ctx) {
          kick(ctx.currentTime, 0.14, sfxGain);
          kick(ctx.currentTime + 0.39, 0.14, sfxGain);
          kick(ctx.currentTime + 1.05, 0.18, sfxGain);
        }
      },
      throwNet() {
        tone(520, 0.14, { type: "triangle", slideTo: 260, vol: 0.07 });
        noise(0.12, { filterType: "bandpass", filterFreq: 900, vol: 0.04 });
      },
      throwDart() {
        tone(1500, 0.05, { type: "square", slideTo: 2200, vol: 0.06 });
        noise(0.04, { filterType: "highpass", filterFreq: 4200, vol: 0.04 });
      },
      bossFire() {
        tone(180, 0.18, { type: "sawtooth", slideTo: 70, vol: 0.11 });
        noise(0.16, { filterType: "lowpass", filterFreq: 520, vol: 0.07 });
      },
      tap() {
        tone(520, 0.04, { type: "square", vol: 0.08 });
      },
    };

    // --- BGM 단순 스텝 시퀀서 ---
    const patterns = {
      normal: {
        bpm: 116,
        bass: [131, 131, 175, 175, 196, 196, 131, 175],
        lead: [523, 659, 784, 659, 698, 784, 659, 523],
        kick: [1, 0, 0, 0, 1, 0, 0, 0],
      },
      boss: {
        bpm: 130,
        bass: [110, 110, 131, 131, 98, 98, 110, 110],
        lead: [440, 523, 659, 523, 494, 523, 440, 392],
        kick: [1, 0, 1, 0, 1, 0, 1, 0],
      },
      victory: {
        bpm: 104,
        bass: [196, 262, 330, 262, 196, 220, 294, 392],
        lead: [784, 988, 1175, 988, 784, 880, 1047, 1319],
        kick: [1, 0, 0, 0, 1, 0, 0, 0],
      },
    };

    function bgmTick() {
      if (!ctx || !bgmTrack) return;
      const p = patterns[bgmTrack];
      if (!p) return;
      const step = bgmStep % p.bass.length;
      tone(p.bass[step], 0.34, { type: "triangle", vol: 0.055, bus: musicGain, attack: 0.02 });
      tone(p.lead[step], 0.2, { type: "square", vol: 0.028, bus: musicGain, attack: 0.02 });
      if (p.kick[step]) kick(ctx.currentTime + 0.02, 0.07);
      bgmStep++;
    }

    function startBgm(track) {
      ensure();
      if (!ctx) return;
      if (bgmTrack === track) return;
      stopBgm(false);
      bgmTrack = track;
      bgmStep = 0;
      const t0 = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(t0);
      musicGain.gain.setValueAtTime(musicGain.gain.value, t0);
      musicGain.gain.linearRampToValueAtTime(MUSIC_VOL, t0 + 1.2);
      const p = patterns[track];
      const stepMs = (60 / p.bpm) * 1000 / 2;
      bgmTick();
      bgmTimer = setInterval(bgmTick, stepMs);
    }

    function stopBgm(fade) {
      if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
      bgmTrack = null;
      if (ctx && musicGain) {
        const t0 = ctx.currentTime;
        musicGain.gain.cancelScheduledValues(t0);
        musicGain.gain.setValueAtTime(musicGain.gain.value, t0);
        if (fade !== false) {
          musicGain.gain.linearRampToValueAtTime(0, t0 + 0.4);
        } else {
          musicGain.gain.setValueAtTime(0, t0 + 0.02);
        }
      }
    }

    function suspend() {
      if (ctx && ctx.state === "running") ctx.suspend();
    }
    function resume() {
      if (ctx && ctx.state === "suspended") ctx.resume();
    }
    function currentTrack() { return bgmTrack; }

    return { ensure, isMuted, setMuted, sfx, startBgm, stopBgm, suspend, resume, currentTrack };
  })();

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
  const pauseOverlay = document.getElementById("pause-overlay");

  const BOSS_DIST = 24000;
  const INTRO_DURATION = 3.2;

  const state = {
    running: false,
    paused: false,
    lastT: 0,
    scroll: SCROLL_START,
    distance: 0,
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    spawnTimer: 1.6,
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
    phase: "normal", // "intro" | "normal" | "approach" | "boss" | "victory" | "outro"
    phaseT: 0,
    introT: 0,
    outroT: 0,
    playerYOffset: 0,
    boss: null,
    bossAnnounce: 0,
    bossBanner: null, // { text, sub, theme, t, total }
    bullets: [],
    sungsimdangSpawned: false,
    stadiumSpawned: false,
    hanbitSpawned: false,
    exitGateSpawned: false,
    breadDropQueue: 0, // number of bread items still to drop after the bakery
    breadDropTimer: 0,
    bonusTimer: 3.5,
    bonusPoints: 0,
    goraniTimer: 1.5,
    scoreFloats: [], // { x, y, t, text }
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
    if (roll < 0.06) {
      kind = "sign"; w = 90; h = 100;
    } else if (roll < 0.78) {
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
    const y = -h - 40;
    state.scenery.push({ kind: "sungsimdang_big", x, y, w, h, label: null });
    // place 3 bread bonuses on the road right next to the bakery (stacked vertically)
    const bw = 80, bh = 80;
    const bx = side === "L"
      ? x + w + 30                     // right edge of left-side bakery → into road
      : x - bw - 30;                   // left edge of right-side bakery → into road
    const bxClamped = Math.max(PLAYER_MARGIN, Math.min(W - PLAYER_MARGIN - bw, bx));
    for (let i = 0; i < 3; i++) {
      state.obstacles.push({
        type: 5, sub: "bread",
        x: bxClamped,
        y: y + 120 + i * 140,
        w: bw, h: bh,
        passed: false, phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function spawnStadium() {
    // big stadium landmark — extends past the sidewalk, larger footprint
    const side = Math.random() < 0.5 ? "L" : "R";
    const w = 340;
    const h = 500;
    const x = side === "L" ? -140 : W - w + 140;  // partially off-screen
    const y = -h - 40;
    state.scenery.push({ kind: "stadium_big", x, y, w, h, side });
    // 3 hotdog bonuses on the road right next to the stadium (stacked vertically)
    const bw = 80, bh = 80;
    const bx = side === "L" ? x + w + 30 : x - bw - 30;
    const bxClamped = Math.max(PLAYER_MARGIN, Math.min(W - PLAYER_MARGIN - bw, bx));
    for (let i = 0; i < 3; i++) {
      state.obstacles.push({
        type: 5, sub: "hotdog",
        x: bxClamped,
        y: y + 120 + i * 140,
        w: bw, h: bh,
        passed: false, phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function spawnExitGate() {
    // highway overhead gantry + tollgate — spans full screen width, one-time landmark
    const w = W;
    const h = 260;
    state.scenery.push({ kind: "exit_gate", x: 0, y: -h - 40, w, h, label: null });
  }

  function spawnHanbit() {
    // 한빛탑 — 아담하고 귀여운 버전 (잘 보이도록 크기 +, 인도 안쪽으로 살짝 배치)
    const side = Math.random() < 0.5 ? "L" : "R";
    const w = 140;
    const h = 340;
    const x = side === "L" ? 16 : W - w - 16;
    const y = -h - 40;

    // 한빛탑과 겹칠 수 있는 일반 건물/간판/나무는 훨씬 위로 밀어올려서 등장 구간을 비워둠
    const hx1 = x - 12;
    const hx2 = x + w + 12;
    const clearY2 = y + h + 120;
    for (let i = 0; i < state.scenery.length; i++) {
      const s = state.scenery[i];
      if (s.kind !== "building" && s.kind !== "sign" && s.kind !== "tree") continue;
      if (s.x < hx2 && s.x + s.w > hx1 && s.y < clearY2) {
        state.scenery[i] = makeScenery(-s.h - 2200 - Math.random() * 400);
      }
    }

    state.scenery.push({ kind: "hanbit_big", x, y, w, h, side });
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
    state.spawnTimer = 1.6;
    state.player.x = W / 2;
    state.player.targetX = W / 2;
    state.player.bob = 0;
    state.obstacles = [];
    state.shake = 0;
    state.clouds = seedClouds();
    state.scenery = seedScenery();
    state.phase = "intro";
    state.phaseT = 0;
    state.introT = 0;
    state.outroT = 0;
    state.playerYOffset = 0;
    state.boss = null;
    state.bossAnnounce = 0;
    state.bossBanner = null;
    state.bullets = [];
    state.sungsimdangSpawned = false;
    state.stadiumSpawned = false;
    state.hanbitSpawned = false;
    state.exitGateSpawned = false;
    state.breadDropQueue = 0;
    state.breadDropTimer = 0;
    state.bonusTimer = 3.5;
    state.bonusPoints = 0;
    state.goraniTimer = 1.5;
    state.scoreFloats = [];
    scoreEl.textContent = "점수 0";
  }

  function showBossBanner(text, sub, theme, total) {
    state.bossBanner = { text, sub: sub || "", theme: theme || "warn", t: 0, total: total || 2.5 };
  }

  function start() {
    reset();
    state.running = true;
    state.paused = false;
    startOverlay.classList.add("hidden");
    overOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    refreshPauseIcon();
    audio.ensure();
    audio.startBgm("normal");
    state.lastT = performance.now();
    requestAnimationFrame(loop);
  }

  function gameOver(reason) {
    state.running = false;
    state.shake = 28;
    audio.stopBgm();
    if (reason === "net") audio.sfx.net();
    else if (reason === "dart") audio.sfx.dart();
    else if (reason === "gorani") audio.sfx.gorani();
    else if (reason === "tanker") audio.sfx.tanker();
    else audio.sfx.gameOver();
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(BEST_KEY, String(state.best));
    }
    bestEl.textContent = "최고 " + state.best;
    finalScoreEl.textContent = "점수 " + state.score;
    finalBestEl.textContent = "최고 " + state.best;
    if (reason === "oil") {
      overTitleEl.textContent = "해협 봉쇄를 뚫지 못했다";
      overSubEl.textContent = "";
      overSubEl.classList.add("hidden");
    } else if (reason === "money") {
      overTitleEl.textContent = "역봉쇄를 뚫지 못했다";
      overSubEl.textContent = "";
      overSubEl.classList.add("hidden");
    } else if (reason === "trump") {
      overTitleEl.textContent = "최종 보스에게 잡혔다";
      overSubEl.textContent = "해협은 봉쇄됐다.";
      overSubEl.classList.remove("hidden");
    } else if (reason === "net") {
      overTitleEl.textContent = "그물에 걸렸다!";
      overSubEl.textContent = "사육사의 손길을 피하지 못했다.";
      overSubEl.classList.remove("hidden");
    } else if (reason === "dart") {
      overTitleEl.textContent = "마취탄 명중";
      overSubEl.textContent = "수의사의 정조준을 피하지 못했다.";
      overSubEl.classList.remove("hidden");
    } else if (reason === "gorani") {
      overTitleEl.textContent = "고라니와 충돌!";
      overSubEl.textContent = "도로 위 또 다른 탈주자에게 받혔다.";
      overSubEl.classList.remove("hidden");
    } else if (reason === "tanker") {
      overTitleEl.textContent = "유조선에 부딪혔다!";
      overSubEl.textContent = "해협의 교통량이 만만치 않다.";
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
  // obstacles: 0 = person (zookeeper/capture/vet), 4 = tanker, 5 = bonus, 6 = gorani
  function spawnObstacle() {
    const type = 0;
    const w = 110, h = 150;

    // 등장 캐릭터는 거리에 따라 다름
    let sub;
    const r = Math.random();
    if (state.distance < NET_UNLOCK_DIST) {
      sub = "zookeeper";
    } else if (state.distance < VET_UNLOCK_DIST) {
      sub = r < 0.55 ? "zookeeper" : "capture";
    } else {
      if (r < 0.30) sub = "zookeeper";
      else if (r < 0.75) sub = "capture";
      else sub = "vet";
    }

    const x = pickSpawnX(w);
    if (x === null) return;
    const o = { type, sub, x, y: -h - 40, w, h, passed: false, phase: Math.random() * Math.PI * 2 };

    // 투척은 역할 기반 — 사육사는 안 쏨, 포획반은 그물, 수의사는 마취총
    // 몹이 화면 상단에 등장하자마자 즉시 던져서, 탄이 몹 뒤에 남아 "제자리에 멈춘" 것처럼 보이는 문제를 방지
    if (sub === "capture") {
      o.throws = "net"; o.thrown = false; o.throwAtY = 20 + Math.random() * 100;
    } else if (sub === "vet") {
      o.throws = "dart"; o.thrown = false; o.throwAtY = 20 + Math.random() * 100;
    }
    state.obstacles.push(o);
  }

  // avoid horizontal overlap with obstacles near the top (recently spawned)
  function pickSpawnX(w) {
    const minX = PLAYER_MARGIN;
    const maxX = W - PLAYER_MARGIN - w;
    for (let tries = 0; tries < 6; tries++) {
      const x = minX + Math.random() * (maxX - minX);
      let clash = false;
      for (const o of state.obstacles) {
        if (o.y > 240) continue;
        const nx = x - 20, nx2 = x + w + 20;
        const ox = o.x, ox2 = o.x + o.w;
        if (nx < ox2 && nx2 > ox) { clash = true; break; }
      }
      if (!clash) return x;
    }
    return null;
  }

  const BONUS_KINDS = ["bread", "bone", "chew"];
  function spawnBonus(sub) {
    const w = 80, h = 80;
    const x = PLAYER_MARGIN + Math.random() * (W - PLAYER_MARGIN * 2 - w);
    state.obstacles.push({ type: 5, sub, x, y: -h - 40, w, h, passed: false, phase: Math.random() * Math.PI * 2 });
  }

  function spawnGorani() {
    const w = 120, h = 160;
    const x = PLAYER_MARGIN + Math.random() * (W - PLAYER_MARGIN * 2 - w);
    // charges down fast — extra vy on top of scroll
    state.obstacles.push({
      type: 6, sub: null, x, y: -h - 40, w, h,
      passed: false, phase: Math.random() * Math.PI * 2,
      vy: 620,
    });
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

    // intro: torch-cutting cage bars sequence — player can't move, no spawning
    if (state.phase === "intro") {
      state.introT += dt;
      // gentle scroll showing the gate area
      state.scroll = 80;
      state.roadOffset = (state.roadOffset + state.scroll * dt) % 160;
      if (state.introT >= INTRO_DURATION) {
        state.phase = "normal";
        state.scroll = SCROLL_START;
      }
      return;
    }

    // outro: 늑구 sails through the strait then triggers credits
    if (state.phase === "outro") {
      state.outroT += dt;
      state.playerYOffset -= 240 * dt;
      // keep the strait scrolling underneath
      state.roadOffset = (state.roadOffset + 280 * dt) % 160;
      if (state.outroT >= 2.6) {
        victory();
        return;
      }
      return;
    }

    // nonlinear difficulty ramp — slower start, steeper late
    const rampT = Math.min(1, state.distance / SCROLL_RAMP_DIST);
    const accelNow = SCROLL_ACCEL * (0.28 + 1.7 * rampT * rampT);
    state.scroll = Math.min(SCROLL_MAX, state.scroll + accelNow * dt);
    state.distance += state.scroll * dt;
    const newScore = Math.floor(state.distance / 25) + state.bonusPoints;
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
    // late-mid landmark: 한빛탑 (93 엑스포 상징)
    if (!state.hanbitSpawned && state.phase === "normal" && state.distance > 10500) {
      state.hanbitSpawned = true;
      spawnHanbit();
    }
    // periodic bone/chew bonus items during normal phase
    // 대전 출구(톨게이트) 지나면 먹을 기회가 없으므로 보너스 스폰 중단
    if (state.phase === "normal" && state.distance > 2200 && !state.exitGateSpawned) {
      state.bonusTimer -= dt;
      if (state.bonusTimer <= 0) {
        const sub = Math.random() < 0.5 ? "bone" : "chew";
        spawnBonus(sub);
        state.bonusTimer = 4.0 + Math.random() * 2.8;
      }
    }
    // 대전 시경계 톨게이트 — 호르무즈로 넘어가기 직전 landmark
    if (!state.exitGateSpawned && state.phase === "normal" && state.distance > BOSS_DIST - 2600) {
      state.exitGateSpawned = true;
      spawnExitGate();
    }
    // 고라니 돌진 — 후반부 난이도 스파이크 (톨게이트 전까지만)
    if (state.phase === "normal" && !state.exitGateSpawned && state.distance > 14000) {
      state.goraniTimer -= dt;
      if (state.goraniTimer <= 0) {
        spawnGorani();
        state.goraniTimer = 3.5 + Math.random() * 2.0;
      }
    }

    // phase transition into boss
    if (state.phase === "normal" && state.distance >= BOSS_DIST) {
      state.phase = "approach";
      state.phaseT = 0;
      audio.sfx.bossWarn();
      audio.startBgm("boss");
      // clear any land obstacles — the world changes to the strait
      state.obstacles = [];
      state.bullets = [];
      // let the first tanker come in soon after the banner appears
      state.spawnTimer = 0.9;
    }
    if (state.bossAnnounce > 0) state.bossAnnounce = Math.max(0, state.bossAnnounce - dt);
    if (state.bossBanner) {
      state.bossBanner.t += dt;
      if (state.bossBanner.t >= state.bossBanner.total) state.bossBanner = null;
    }
    if (state.phase === "approach" || state.phase === "boss" || state.phase === "victory") {
      state.phaseT += dt;
    }
    if (state.phase === "approach") {
      // 페이즈 1 시그널 배너 + 사이렌
      if (state.phaseT < dt * 2 && !state.bossBanner) {
        showBossBanner("⚓ 해협 봉쇄", "", "warn", 2.8);
        audio.sfx.siren();
      }
      if (state.phaseT >= 6.0) {
        state.phase = "boss";
        state.phaseT = 0;
        state.boss = {
          bossPhase: 1,
          x: W / 2,
          y: 280,
          w: 240,
          h: 260,
          vx: 180,
          vy: 90,
          hp: 100,
          hpMax: 100,
          fireTimer: 1.0,
          entryT: 0,
          transitionT: 0,
          dead: false,
          deadT: 0,
        };
      }
    }

    // spawn (land obstacles in normal, tankers during approach/boss)
    // 톨게이트 지나면 빌런 스폰 중단 — 조용한 도로로 호르무즈까지 배웅
    if (state.phase === "normal" && !state.exitGateSpawned) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnObstacle();
        const ratio = (state.scroll - SCROLL_START) / (SCROLL_MAX - SCROLL_START);
        const minI = Math.max(0.32, SPAWN_MIN - ratio * 0.6);
        const maxI = Math.max(0.58, SPAWN_MAX - ratio * 1.0);
        state.spawnTimer = minI + Math.random() * (maxI - minI);
      }
    }
    // during approach/boss, no obstacles spawn — tankers are background only

    // move obstacles + keeper net throws
    for (const o of state.obstacles) {
      o.y += (state.scroll + (o.vy || 0)) * dt;
      if (o.throws && !o.thrown && o.y >= o.throwAtY) {
        o.thrown = true;
        const nx = o.x + o.w / 2;
        const ny = o.y + o.h * 0.4;
        // skip firing if the keeper is already too close vertically — unfair since player only moves left/right
        if (PLAYER_Y - ny < 360) continue;
        const tx = p.x;
        const ty = PLAYER_Y;
        const dx = tx - nx;
        const dy = Math.max(40, ty - ny);
        const mag = Math.hypot(dx, dy) || 1;
        let speed, r;
        if (o.throws === "dart") { speed = 780; r = 14; } // 수의사 마취총 — 빠르고 작음
        else { speed = 360; r = 45; }                     // 사육사 그물 — 느리고 큼 (1.5배)
        state.bullets.push({
          kind: o.throws,
          x: nx, y: ny,
          vx: dx / mag * speed,
          vy: dy / mag * speed,
          r,
          spin: 0,
        });
        if (o.throws === "dart") audio.sfx.throwDart();
        else audio.sfx.throwNet();
      }
    }
    state.obstacles = state.obstacles.filter((o) => o.y < H + 60);

    // boss: 2-phase fight — Iran (phase 1, 기름통) → Trump (phase 2, 돈뭉치)
    // boss moves up/down/left/right inside the upper zone; HP drains over time.
    if (state.phase === "boss" && state.boss) {
      const b = state.boss;
      const BOSS_MIN_X = 140, BOSS_MAX_X = W - 140;
      // 두 보스 모두 수면 위까지만 내려오도록 제한 (수면 = H*0.55, 보스 h=260)
      const BOSS_MIN_Y = 220, BOSS_MAX_Y = Math.floor(H * 0.55 - 260 * 0.9);

      if (b.transitionT > 0) {
        // 페이즈 1 → 페이즈 2 핸드오프: 수문장 퇴장 후 역봉쇄 시그널 깜빡깜빡 → 황금머리 입장
        b.transitionT -= dt;
        // 페이즈 1 보스는 화면 밖으로 치워둠 (drawBoss 호출돼도 안 보임)
        b.y = H + 400;
        if (b.transitionT <= 0) {
          b.bossPhase = 2;
          b.hp = 100;
          b.hpMax = 100;
          b.fireTimer = 1.0;
          b.entryT = 0;
          b.y = 280;
          b.x = W / 2;
          b.vx = 200;
          b.vy = 80;
          b.dead = false;
          b.deadT = 0;
        }
      } else if (!b.dead) {
        b.entryT += dt;
        const ENTRY_DURATION = 2.5;
        if (b.entryT < ENTRY_DURATION) {
          // 등장 연출 — 위에서 천천히 내려오는 애니메이션 (움직임·공격·HP 드레인 모두 스킵)
          const t = b.entryT / ENTRY_DURATION;
          const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic — 더 부드럽게
          b.x = W / 2;
          b.y = -b.h + (280 + b.h) * ease;
          b.fireTimer = 1.0;
        } else {
          // up/down/left/right drift with bounce + jitter — 페이즈 2는 속도 증가
          const moveMult = b.bossPhase === 2 ? 1.15 : 1.0;
          b.x += b.vx * moveMult * dt;
          b.y += b.vy * moveMult * dt;
          if (b.x < BOSS_MIN_X) { b.x = BOSS_MIN_X; b.vx = Math.abs(b.vx); }
          if (b.x > BOSS_MAX_X) { b.x = BOSS_MAX_X; b.vx = -Math.abs(b.vx); }
          if (b.y < BOSS_MIN_Y) { b.y = BOSS_MIN_Y; b.vy = Math.abs(b.vy); }
          if (b.y > BOSS_MAX_Y) { b.y = BOSS_MAX_Y; b.vy = -Math.abs(b.vy); }
          // 방향 전환 빈도 — 페이즈 2는 더 불규칙하게
          const flipRate = b.bossPhase === 2 ? 0.022 : 0.012;
          if (Math.random() < flipRate) b.vx = (Math.random() * 2 - 1) * (b.bossPhase === 2 ? 260 : 240);
          if (Math.random() < flipRate) b.vy = (Math.random() * 2 - 1) * (b.bossPhase === 2 ? 150 : 130);

          // HP drain — 페이즈 1 ~15s, 페이즈 2 ~18s (최종 보스라 조금 더 오래 버텨야 함)
          const drainDuration = b.bossPhase === 2 ? 18 : 15;
          const drainRate = b.hpMax / drainDuration;
          b.hp = Math.max(0, b.hp - drainRate * dt);

          // fire projectiles at the player
          b.fireTimer -= dt;
          if (b.fireTimer <= 0) {
            const bx = b.x;
            const by = b.y + b.h * 0.55;
            const dx = p.x - bx;
            const dy = PLAYER_Y - by;
            const mag = Math.hypot(dx, dy) || 1;
            // 페이즈 2는 단발이지만 더 빠른 탄속 + 더 높은 연사력
            const speed = b.bossPhase === 1 ? 480 : 620;
            const kind = b.bossPhase === 1 ? "oilbarrel" : "money";
            const r = b.bossPhase === 1 ? 26 : 24;
            state.bullets.push({
              x: bx, y: by,
              vx: dx / mag * speed,
              vy: dy / mag * speed,
              r, spin: 0, kind,
            });
            audio.sfx.bossFire();
            b.fireTimer = b.bossPhase === 1 ? 1.05 : 0.5;
          }

          // HP 소진 → 두 보스 모두 쓰러지는 연출 먼저 (마리오식 스핀+낙하)
          if (b.hp <= 0) {
            b.dead = true;
            b.deadT = 0;
            state.bullets = [];
            if (b.bossPhase === 2) {
              audio.sfx.victory();
              audio.startBgm("victory");
            } else {
              audio.sfx.bossFire();
            }
          }
        }
      } else {
        // 마리오식 스핀+낙하
        b.deadT += dt;
        if (b.deadT < 0.35) {
          b.y -= 260 * dt;
        } else {
          b.y += 1700 * dt * Math.min(1, (b.deadT - 0.35) * 3);
        }
        if (b.deadT > 0.85) {
          if (b.bossPhase === 1) {
            // 수문장 퇴장 완료 → 역봉쇄 시그널 깜박 후 황금머리 등장
            b.transitionT = 3.0;
            showBossBanner("💵 역봉쇄", "", "counter", 2.8);
            audio.sfx.siren();
          } else {
            state.phase = "outro";
            state.outroT = 0;
            state.boss = null;
            state.bullets = [];
            state.obstacles = [];
            return;
          }
        }
      }
    }

    // bullets update
    // net/dart는 월드 공간의 물체 — 세계 스크롤과 함께 내려가야 "뒤에 남겨진/올라가는" 것처럼 보이지 않음
    for (const bt of state.bullets) {
      bt.x += bt.vx * dt;
      bt.y += bt.vy * dt;
      if (bt.kind === "net" || bt.kind === "dart") {
        bt.y += state.scroll * dt;
      }
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
        let reason;
        if (bt.kind === "net" || bt.kind === "dart") reason = bt.kind;
        else if (bt.kind === "oilbarrel") reason = "oil";
        else if (bt.kind === "money") reason = "money";
        else reason = "trump";
        gameOver(reason);
        return;
      }
    }

    // obstacle collision (extra padding on obstacle sides too)
    for (let i = 0; i < state.obstacles.length; i++) {
      const o = state.obstacles[i];
      if (px1 < o.x + o.w - 14 && px2 > o.x + 14 && py1 < o.y + o.h - 14 && py2 > o.y + 14) {
        if (o.type === 5) {
          // bonus item — +100 score, floating popup, no death
          state.bonusPoints += 100;
          state.score += 100;
          scoreEl.textContent = "점수 " + state.score;
          state.scoreFloats.push({ x: o.x + o.w / 2, y: o.y + o.h / 2, t: 0, text: "+100" });
          state.obstacles.splice(i, 1);
          audio.sfx.pickup();
          i--;
          continue;
        } else if (o.type === 6) {
          gameOver("gorani");
          return;
        } else if (o.type === 4) {
          gameOver("tanker");
          return;
        } else {
          gameOver();
          return;
        }
      }
    }

    // score float popups
    for (const f of state.scoreFloats) f.t += dt;
    state.scoreFloats = state.scoreFloats.filter((f) => f.t < 1.0);

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
    const isBossBg = state.phase === "approach" || state.phase === "boss" || state.phase === "victory" || state.phase === "outro";

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

      // 호르무즈 해협 배너 — 제거 (봉쇄 시그널로 이미 인지 가능)
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
    const cy = PLAYER_Y + bob + (state.playerYOffset || 0);
    if (cy < -120) return;

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

    // soft shoulder shading — darker at the front (shoulders),
    // fading toward the rump. gradient makes it look like fur,
    // not a patterned shape.
    const backGrad = ctx.createRadialGradient(
      cx, cy - bodyRy * 0.3, 4,
      cx, cy + bodyRy * 0.2, bodyRy * 1.1
    );
    backGrad.addColorStop(0, FUR_MID);
    backGrad.addColorStop(0.6, "rgba(150,125,87,0.45)");
    backGrad.addColorStop(1, "rgba(150,125,87,0)");
    ctx.fillStyle = backGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, bodyRx * 0.9, bodyRy * 0.95, 0, 0, Math.PI * 2);
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

    // visible portion of the building (since it may extend off-screen)
    const onLeft = (x + w / 2) < W / 2;
    const vLeft = Math.max(x, 4);
    const vRight = Math.min(x + w, W - 4);
    const vCenter = (vLeft + vRight) / 2;

    // signboard geometry (drawn after windows so it sits on top)
    const sbW = 36;
    const sbX = onLeft ? vRight - sbW - 4 : vLeft + 4;
    const sbY = y + 160;

    // arched windows first — signboard/banner will overlay on top to avoid text being covered
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const wx = x + 18 + c * ((w - 80) / 2);
        const wy = y + 250 + r * 80;
        // skip windows that would sit under the vertical signboard strip
        if (wx + 32 > sbX - 2 && wx < sbX + sbW + 2) continue;
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

    // vertical 빵맛집 signboard — painted on top of any leftover window geometry
    ctx.fillStyle = "#1a1a1a";
    roundRect(sbX, sbY, sbW, 220, 3); ctx.fill();
    ctx.fillStyle = "#ffd84a";
    ctx.font = "bold 30px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("빵", sbX + sbW / 2, sbY + 46);
    ctx.fillText("맛", sbX + sbW / 2, sbY + 108);
    ctx.fillText("집", sbX + sbW / 2, sbY + 170);

    // horizontal cream banner — centered on the visible half of the facade
    const bnWidth = Math.min(vRight - vLeft - sbW - 20, 170);
    const bnOffset = onLeft ? -(sbW / 2 + 4) : (sbW / 2 + 4);
    const bnCx = vCenter + bnOffset;
    const bnLeft = bnCx - bnWidth / 2;
    ctx.fillStyle = "#f4ecd8";
    roundRect(bnLeft, y + 180, bnWidth, 40, 3); ctx.fill();
    ctx.strokeStyle = "#3a2a20"; ctx.lineWidth = 2;
    ctx.strokeRect(bnLeft, y + 180, bnWidth, 40);
    ctx.fillStyle = "#c2342a";
    ctx.font = "bold 20px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("갓 구운 빵", bnCx, y + 207);

    // awnings at bottom (dark gray)
    ctx.fillStyle = "#2a2a30";
    ctx.fillRect(x + 4, y + h - 46, w - 8, 14);
    // awning stripes
    ctx.fillStyle = "#fff4dc";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FRESH BAKERY", x + w / 2, y + h - 36);

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
    const bob = Math.sin((idx * 0.9) + performance.now() / 500) * 1.5;
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

    // centerfield eagle logo — stylized spread-wing silhouette
    const elx = cx;
    const ely = cy - ry * 0.15;
    ctx.fillStyle = "#f4f4f4";
    ctx.beginPath();
    // left wing
    ctx.moveTo(elx - 2, ely + 2);
    ctx.quadraticCurveTo(elx - 20, ely - 8, elx - 36, ely - 2);
    ctx.quadraticCurveTo(elx - 24, ely, elx - 18, ely + 6);
    ctx.quadraticCurveTo(elx - 10, ely + 4, elx - 2, ely + 6);
    ctx.closePath();
    ctx.fill();
    // right wing (mirror)
    ctx.beginPath();
    ctx.moveTo(elx + 2, ely + 2);
    ctx.quadraticCurveTo(elx + 20, ely - 8, elx + 36, ely - 2);
    ctx.quadraticCurveTo(elx + 24, ely, elx + 18, ely + 6);
    ctx.quadraticCurveTo(elx + 10, ely + 4, elx + 2, ely + 6);
    ctx.closePath();
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.ellipse(elx, ely + 8, 4, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(elx, ely - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    // beak
    ctx.fillStyle = "#ffb84a";
    ctx.beginPath();
    ctx.moveTo(elx, ely - 2);
    ctx.lineTo(elx + 6, ely - 1);
    ctx.lineTo(elx, ely + 2);
    ctx.closePath();
    ctx.fill();
    // eye
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(elx - 1, ely - 3, 0.8, 0, Math.PI * 2);
    ctx.fill();

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

    // team banner — clamp to the on-screen half so the label isn't clipped
    const bnw = 230;
    const bnh = 34;
    const bnCx = Math.max(bnw / 2 + 12, Math.min(W - bnw / 2 - 12, cx));
    const bnx = bnCx - bnw / 2;
    const bny = cy + ry - bnh - 10;
    ctx.fillStyle = "#ffffff";
    roundRect(bnx - 3, bny - 3, bnw + 6, bnh + 6, 6); ctx.fill();
    ctx.fillStyle = "#ff7a2a";
    roundRect(bnx, bny, bnw, bnh, 5); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚾ 야구장", bnCx, bny + bnh / 2);
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

  function drawExitGate(s) {
    // Highway overhead gantry + tollgate spanning the full road.
    // Marks the edge of Daejeon — the road gives way to sea after this.
    const x = s.x, y = s.y, w = s.w, h = s.h;
    // ground shadow across the road
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x, y + h - 16, w, 14);

    // two side pylons (on the sidewalks)
    const pylW = 34;
    const pylH = 190;
    const pylY = y + 30;
    const leftX = x + 8;
    const rightX = x + w - pylW - 8;
    ctx.fillStyle = "#8a8f95";
    ctx.fillRect(leftX, pylY, pylW, pylH);
    ctx.fillRect(rightX, pylY, pylW, pylH);
    // pylon caps
    ctx.fillStyle = "#5a6068";
    ctx.fillRect(leftX - 4, pylY, pylW + 8, 10);
    ctx.fillRect(rightX - 4, pylY, pylW + 8, 10);
    // pylon stripes (reflective tape)
    ctx.fillStyle = "#ffcc33";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(leftX, pylY + 40 + i * 36, pylW, 6);
      ctx.fillRect(rightX, pylY + 40 + i * 36, pylW, 6);
    }

    // overhead beam across the full road
    const beamY = y + 20;
    const beamH = 22;
    ctx.fillStyle = "#4a5058";
    ctx.fillRect(x, beamY, w, beamH);
    ctx.fillStyle = "#2a2e34";
    ctx.fillRect(x, beamY + beamH - 4, w, 4);

    // big green highway sign on the beam
    const sgnW = w * 0.64;
    const sgnH = 110;
    const sgnX = x + (w - sgnW) / 2;
    const sgnY = beamY + beamH + 4;
    ctx.fillStyle = "#1f6f3e";
    roundRect(sgnX, sgnY, sgnW, sgnH, 6); ctx.fill();
    // white inner border
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
    ctx.strokeRect(sgnX + 5, sgnY + 5, sgnW - 10, sgnH - 10);
    // main text
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 32px 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText("안녕히 가세요", sgnX + sgnW / 2, sgnY + 34);
    ctx.font = "bold 22px 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText("대전광역시", sgnX + sgnW / 2, sgnY + 66);
    // sub line
    ctx.font = "bold 14px ui-monospace, 'SF Mono', Menlo, monospace";
    ctx.fillStyle = "#cfe4d6";
    ctx.fillText("NEXT EXIT → 호르무즈", sgnX + sgnW / 2, sgnY + 92);
    ctx.textBaseline = "alphabetic";

    // small side arrows on the beam edges
    ctx.fillStyle = "#ffd84a";
    ctx.beginPath();
    ctx.moveTo(x + pylW + 24, beamY + beamH / 2 - 6);
    ctx.lineTo(x + pylW + 44, beamY + beamH / 2);
    ctx.lineTo(x + pylW + 24, beamY + beamH / 2 + 6);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w - pylW - 24, beamY + beamH / 2 - 6);
    ctx.lineTo(x + w - pylW - 44, beamY + beamH / 2);
    ctx.lineTo(x + w - pylW - 24, beamY + beamH / 2 + 6);
    ctx.closePath(); ctx.fill();
  }

  function drawHanbitBig(s) {
    // 한빛탑 — 아담/귀여운 chibi 버전 (둥근 베이스·통통한 포드·짧은 첨탑)
    const cx = s.x + s.w / 2;
    const baseY = s.y + s.h;
    const topY = s.y;

    // 바닥 그림자
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 4, s.w * 0.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 둥근 돌 베이스 — 원래의 natural stone 톤 + 진한 외곽선
    const baseW = s.w * 0.82;
    const baseH = 20;
    ctx.fillStyle = "#8a7c66";
    roundRect(cx - baseW / 2, baseY - baseH, baseW, baseH, 6); ctx.fill();
    ctx.strokeStyle = "#2a2218";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#a69780";
    ctx.fillRect(cx - baseW / 2 + 4, baseY - baseH + 3, baseW - 8, 2);

    // 통통한 샤프트 — cream 톤 유지, 외곽선만 진하게
    const shaftBottomW = s.w * 0.38;
    const shaftTopW = s.w * 0.26;
    const shaftBottomY = baseY - baseH;
    const shaftTopY = topY + s.h * 0.34;
    ctx.fillStyle = "#dcd4c4";
    ctx.beginPath();
    ctx.moveTo(cx - shaftBottomW / 2, shaftBottomY);
    ctx.lineTo(cx + shaftBottomW / 2, shaftBottomY);
    ctx.lineTo(cx + shaftTopW / 2, shaftTopY);
    ctx.lineTo(cx - shaftTopW / 2, shaftTopY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#2a2218";
    ctx.lineWidth = 2;
    ctx.stroke();
    // 샤프트 오른쪽 음영
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(cx + shaftTopW / 2 - 3, shaftTopY, 3, shaftBottomY - shaftTopY);

    // 둥근 관측 포드 — 원래의 metallic gray-blue + 진한 외곽선
    const podCy = shaftTopY - 2;
    const podW = s.w * 0.72;
    const podH = 22;
    // 아랫면
    ctx.fillStyle = "#9aa6b0";
    ctx.beginPath();
    ctx.ellipse(cx, podCy, podW / 2, podH * 0.45, 0, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#2a2a33";
    ctx.lineWidth = 2;
    ctx.stroke();
    // 본체
    ctx.fillStyle = "#c7d2dc";
    ctx.beginPath();
    ctx.ellipse(cx, podCy - podH * 0.35, podW / 2, podH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 창문 띠
    ctx.fillStyle = "#2a4a6a";
    const winCount = 5;
    const winSpacing = (podW - 20) / (winCount - 1);
    for (let i = 0; i < winCount; i++) {
      ctx.beginPath();
      ctx.arc(cx - (podW - 20) / 2 + i * winSpacing, podCy - podH * 0.35, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 짧은 첨탑 — 원래 실버톤 + 진한 외곽선
    const spireBottomY = podCy - podH * 0.8;
    const spireTopY = topY + 10;
    ctx.fillStyle = "#a8b2bc";
    ctx.beginPath();
    ctx.moveTo(cx - 4, spireBottomY);
    ctx.lineTo(cx + 4, spireBottomY);
    ctx.lineTo(cx, spireTopY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#2a2a33";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 끝에 동그란 빨간 램프 (큼직하게 귀엽게)
    const blink = (Math.floor(state.distance / 40) % 2) === 0;
    ctx.fillStyle = blink ? "#ff4030" : "#802018";
    ctx.beginPath();
    ctx.arc(cx, spireTopY, 4, 0, Math.PI * 2);
    ctx.fill();
    if (blink) {
      ctx.fillStyle = "rgba(255,120,100,0.35)";
      ctx.beginPath();
      ctx.arc(cx, spireTopY, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 명판
    const plqW = 56, plqH = 18;
    const plqX = cx - plqW / 2;
    const plqY = baseY - baseH - plqH - 2;
    ctx.fillStyle = "#2a2a2a";
    roundRect(plqX - 2, plqY - 2, plqW + 4, plqH + 4, 4); ctx.fill();
    ctx.fillStyle = "#ffd84a";
    roundRect(plqX, plqY, plqW, plqH, 4); ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 11px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("한빛탑", cx, plqY + plqH / 2);
    ctx.textBaseline = "alphabetic";
  }

  function drawScenery(s) {
    if (s.kind === "sungsimdang_big") {
      drawSungsimdangBig(s);
    } else if (s.kind === "stadium_big") {
      drawStadiumBig(s);
    } else if (s.kind === "hanbit_big") {
      drawHanbitBig(s);
    } else if (s.kind === "exit_gate") {
      drawExitGate(s);
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

    // 사육사 기본 팔레트 — 포획반은 모자 색만 다름
    let uniform = "#7a6a3e", cap = "#4a5c2e", accent = "#d4c18b";
    if (o.sub === "capture") {
      cap = "#c22820"; // 빨간 모자로 그물 담당 구분
    } else if (o.sub === "vet") {
      uniform = "#f0f4f6"; cap = "#d8dfe2"; accent = "#2a9a88";
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
    // vet-only: stethoscope draped over shoulders
    if (o.sub === "vet") {
      ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 18, y + h * 0.34);
      ctx.quadraticCurveTo(cx, y + h * 0.48, cx + 18, y + h * 0.34);
      ctx.stroke();
      ctx.fillStyle = "#c9cfd4";
      ctx.beginPath();
      ctx.arc(cx + 10, y + h * 0.5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a3a3a";
      ctx.beginPath();
      ctx.arc(cx + 10, y + h * 0.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBullet(bt) {
    if (bt.kind === "net") {
      drawNet(bt);
      return;
    }
    if (bt.kind === "dart") {
      drawDart(bt);
      return;
    }
    if (bt.kind === "money") {
      drawMoneyBundle(bt);
      return;
    }
    drawOilBarrel(bt);
  }

  function drawMoneyBundle(bt) {
    // 100달러 지폐 묶음 — 종이 스택 + 십자 밴드
    const r = bt.r;
    const w = r * 2.3;
    const h = r * 1.35;
    ctx.save();
    ctx.translate(bt.x, bt.y);
    ctx.rotate(bt.spin * 0.35);

    // 그림자
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(2, h / 2 + 6, w / 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 뒷쪽 지폐 (스택 느낌)
    ctx.fillStyle = "#c8e4c0";
    ctx.fillRect(-w / 2 + 3, -h / 2 - 3, w, h);
    ctx.fillStyle = "#d0e8c8";
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // 본체 지폐 — 민트 그린
    const bill = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    bill.addColorStop(0, "#6aa86a");
    bill.addColorStop(0.5, "#8ac48a");
    bill.addColorStop(1, "#5a9a5a");
    ctx.fillStyle = bill;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // 내부 테두리
    ctx.strokeStyle = "rgba(20, 60, 20, 0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);

    // 가운데 동그라미 초상 자리
    ctx.fillStyle = "#d0e8c8";
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.22, h * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2a5a2a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.22, h * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 초상 실루엣
    ctx.fillStyle = "#5a8a5a";
    ctx.beginPath();
    ctx.arc(0, -h * 0.05, h * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-h * 0.18, h * 0.06, h * 0.36, h * 0.2);

    // 모서리 숫자
    ctx.fillStyle = "#ffd84a";
    ctx.font = `bold ${Math.max(9, Math.round(r * 0.45))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("100", -w / 2 + 12, -h / 2 + 8);
    ctx.fillText("100", w / 2 - 12, h / 2 - 8);

    // 밴드 (묶음끈) — 노란색 가로 띠
    ctx.fillStyle = "#ffd84a";
    ctx.fillRect(-w / 2 - 2, -h * 0.18, w + 4, h * 0.2);
    ctx.fillStyle = "#b08a12";
    ctx.fillRect(-w / 2 - 2, -h * 0.18, w + 4, 2);
    ctx.fillRect(-w / 2 - 2, -h * 0.18 + h * 0.18, w + 4, 2);
    // 밴드 위 $ 마크
    ctx.fillStyle = "#1a1a1a";
    ctx.font = `bold ${Math.max(10, Math.round(r * 0.55))}px sans-serif`;
    ctx.fillText("$ $ $", 0, -h * 0.08);
    ctx.textBaseline = "alphabetic";

    ctx.restore();
  }

  function drawOilBarrel(bt) {
    // 측면 실린더 뷰 — 굴러오는 느낌을 위해 bt.spin 으로 tumble
    const r = bt.r;
    const bodyW = r * 1.7;   // 좁은 쪽 (원통 폭)
    const bodyH = r * 2.2;   // 긴 쪽 (원통 높이)
    ctx.save();
    ctx.translate(bt.x, bt.y);
    ctx.rotate(bt.spin * 0.6);

    // 그림자 (아래쪽 살짝)
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(2, bodyH / 2 + 6, bodyW / 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 원통 몸통 (주황)
    const bx = -bodyW / 2;
    const by = -bodyH / 2;
    const grad = ctx.createLinearGradient(bx, 0, bx + bodyW, 0);
    grad.addColorStop(0, "#8a2a0a");
    grad.addColorStop(0.4, "#d8602a");
    grad.addColorStop(0.7, "#e8884a");
    grad.addColorStop(1, "#7a240a");
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by + 4, bodyW, bodyH - 8);

    // 위/아래 뚜껑 (타원으로 3D 실린더 느낌)
    ctx.fillStyle = "#b04018";
    ctx.beginPath();
    ctx.ellipse(0, by + 4, bodyW / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a1808";
    ctx.beginPath();
    ctx.ellipse(0, by + bodyH - 4, bodyW / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // 위 뚜껑 하이라이트
    ctx.fillStyle = "#f0a070";
    ctx.beginPath();
    ctx.ellipse(0, by + 4, bodyW / 2 - 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // 마개 (bunghole)
    ctx.fillStyle = "#2a0a04";
    ctx.beginPath();
    ctx.arc(bodyW / 4, by + 4, 3, 0, Math.PI * 2);
    ctx.fill();

    // 가로 리브(골) 2줄 — 기름통 정체성의 핵심
    ctx.strokeStyle = "#5a1808";
    ctx.lineWidth = 2;
    const rib1 = by + bodyH * 0.32;
    const rib2 = by + bodyH * 0.68;
    ctx.beginPath();
    ctx.moveTo(bx + 2, rib1);
    ctx.lineTo(bx + bodyW - 2, rib1);
    ctx.moveTo(bx + 2, rib2);
    ctx.lineTo(bx + bodyW - 2, rib2);
    ctx.stroke();
    // 리브 하이라이트
    ctx.strokeStyle = "rgba(255, 200, 150, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + 2, rib1 - 2);
    ctx.lineTo(bx + bodyW - 2, rib1 - 2);
    ctx.moveTo(bx + 2, rib2 - 2);
    ctx.lineTo(bx + bodyW - 2, rib2 - 2);
    ctx.stroke();

    // OIL 라벨 — 가운데 칸
    ctx.fillStyle = "#1a0a04";
    const labelW = bodyW * 0.7;
    const labelH = (rib2 - rib1) * 0.6;
    const labelX = -labelW / 2;
    const labelY = (rib1 + rib2) / 2 - labelH / 2;
    ctx.fillRect(labelX, labelY, labelW, labelH);
    ctx.fillStyle = "#ffd84a";
    ctx.font = `bold ${Math.max(10, Math.round(r * 0.7))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OIL", 0, (rib1 + rib2) / 2);
    ctx.textBaseline = "alphabetic";

    // 세로 하이라이트 (금속 반사)
    ctx.fillStyle = "rgba(255, 230, 190, 0.28)";
    ctx.fillRect(bx + 4, by + 8, 4, bodyH - 16);

    ctx.restore();
  }

  function drawDart(bt) {
    // 마취총 탄 — 빠른 작은 주사바늘 모양
    const cx = bt.x, cy = bt.y;
    const ang = Math.atan2(bt.vy, bt.vx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    // motion trail
    ctx.strokeStyle = "rgba(220, 230, 255, 0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(-bt.r - 2, 0);
    ctx.stroke();
    // body (glass tube with colored liquid)
    ctx.fillStyle = "#d0d6e0";
    roundRect(-bt.r, -4, bt.r * 1.6, 8, 2); ctx.fill();
    ctx.fillStyle = "#7a4aa8";
    ctx.fillRect(-bt.r + 2, -3, bt.r * 1.2, 6);
    // needle tip
    ctx.fillStyle = "#b8b8c0";
    ctx.beginPath();
    ctx.moveTo(bt.r * 0.6, -3);
    ctx.lineTo(bt.r + 4, 0);
    ctx.lineTo(bt.r * 0.6, 3);
    ctx.closePath();
    ctx.fill();
    // feather fletching at back
    ctx.fillStyle = "#c02a2a";
    ctx.beginPath();
    ctx.moveTo(-bt.r, -4);
    ctx.lineTo(-bt.r - 5, -6);
    ctx.lineTo(-bt.r - 5, 6);
    ctx.lineTo(-bt.r, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawNet(bt) {
    const cx = bt.x, cy = bt.y, r = bt.r;
    const spin = bt.spin || 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin * 0.4);

    // build an irregular, billowing outline (8-point polygon with per-vertex jitter)
    const points = 10;
    const ring = [];
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2;
      const wobble = 0.78 + Math.sin(a * 3 + spin * 2) * 0.18;
      ring.push({ a, x: Math.cos(a) * r * wobble, y: Math.sin(a) * r * wobble });
    }

    // weighted rope ends hanging off the rim — safety orange for visibility
    ctx.strokeStyle = "#ff7a2a";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < points; i += 2) {
      const p = ring[i];
      const tx = p.x * 1.35;
      const ty = p.y * 1.35;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // small weight at the end
      ctx.fillStyle = "#c0321a";
      ctx.beginPath();
      ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // soft net "fabric" fill — translucent warm yellow so it pops on dark road
    ctx.fillStyle = "rgba(255, 210, 80, 0.35)";
    ctx.beginPath();
    ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < points; i++) {
      const prev = ring[i - 1];
      const cur = ring[i];
      const mx = (prev.x + cur.x) / 2;
      const my = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    ctx.quadraticCurveTo(ring[points - 1].x, ring[points - 1].y, ring[0].x, ring[0].y);
    ctx.closePath();
    ctx.fill();

    // diamond mesh — clipped to the irregular outline, rotated 45° for net look
    ctx.save();
    ctx.clip();
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = "rgba(220, 60, 30, 0.9)";
    ctx.lineWidth = 1.6;
    const step = 9;
    const span = r * 1.6;
    for (let i = -span; i <= span; i += step) {
      ctx.beginPath();
      ctx.moveTo(-span, i);
      ctx.lineTo(span, i);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i, -span);
      ctx.lineTo(i, span);
      ctx.stroke();
    }
    // knots at intersections — bright yellow dots
    ctx.fillStyle = "rgba(255, 230, 100, 0.95)";
    for (let i = -span; i <= span; i += step) {
      for (let j = -span; j <= span; j += step) {
        if ((i * i + j * j) < r * r * 1.2) {
          ctx.fillRect(i - 1, j - 1, 2, 2);
        }
      }
    }
    ctx.restore();

    // dark outer glow for extra contrast on bright backgrounds
    ctx.strokeStyle = "rgba(40, 20, 10, 0.7)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < points; i++) {
      const prev = ring[i - 1];
      const cur = ring[i];
      const mx = (prev.x + cur.x) / 2;
      const my = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    ctx.quadraticCurveTo(ring[points - 1].x, ring[points - 1].y, ring[0].x, ring[0].y);
    ctx.stroke();

    // rope rim — thick bright orange outer cord
    ctx.strokeStyle = "#ff7a2a";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < points; i++) {
      const prev = ring[i - 1];
      const cur = ring[i];
      const mx = (prev.x + cur.x) / 2;
      const my = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    ctx.quadraticCurveTo(ring[points - 1].x, ring[points - 1].y, ring[0].x, ring[0].y);
    ctx.stroke();

    ctx.restore();
  }

  function drawObstacle(o) {
    if (o.type === 0) {
      drawPerson(o);
    } else if (o.type === 4) {
      drawTanker(o);
    } else if (o.type === 5) {
      drawBonus(o);
    } else if (o.type === 6) {
      drawGorani(o);
    }
  }

  function drawGorani(o) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    // flip so the head faces the direction of travel (downward)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI);
    ctx.translate(-cx, -cy);
    const t = performance.now() / 80 + o.phase; // fast gallop
    const bob = Math.sin(t) * 3;
    const yy = cy + bob;
    // speed streak above (showing charge)
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const sx = cx - 24 + i * 16;
      ctx.beginPath();
      ctx.moveTo(sx, cy - o.h * 0.7);
      ctx.lineTo(sx + 4, cy - o.h * 0.35);
      ctx.stroke();
    }
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(cx, yy + 60, 50, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // legs (gallop pose — front pair forward, back pair back)
    ctx.fillStyle = "#6a4a2a";
    const legOff = Math.sin(t) * 4;
    roundRect(cx - 30, yy - 38 + legOff, 10, 32, 4); ctx.fill();
    roundRect(cx + 20, yy - 38 - legOff, 10, 32, 4); ctx.fill();
    roundRect(cx - 28, yy + 28 - legOff, 10, 32, 4); ctx.fill();
    roundRect(cx + 18, yy + 28 + legOff, 10, 32, 4); ctx.fill();
    // dark hooves
    ctx.fillStyle = "#2a1a0e";
    ctx.fillRect(cx - 31, yy - 8 + legOff, 12, 5);
    ctx.fillRect(cx + 19, yy - 8 - legOff, 12, 5);
    ctx.fillRect(cx - 29, yy + 58 - legOff, 12, 5);
    ctx.fillRect(cx + 17, yy + 58 + legOff, 12, 5);
    // body — warm brown elongated oval (helicopter top-down view)
    ctx.fillStyle = "#a07848";
    ctx.beginPath();
    ctx.ellipse(cx, yy + 6, 42, 56, 0, 0, Math.PI * 2);
    ctx.fill();
    // darker back stripe
    ctx.fillStyle = "#6f5028";
    ctx.beginPath();
    ctx.ellipse(cx, yy + 2, 14, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    // white rump patch
    ctx.fillStyle = "#f2e4c8";
    ctx.beginPath();
    ctx.ellipse(cx, yy + 52, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // head (smaller, forward)
    ctx.fillStyle = "#8a6638";
    ctx.beginPath();
    ctx.ellipse(cx, yy - 52, 22, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    // ears (small, pointed forward)
    ctx.fillStyle = "#6a4a2a";
    ctx.beginPath();
    ctx.moveTo(cx - 22, yy - 70); ctx.lineTo(cx - 14, yy - 86); ctx.lineTo(cx - 8, yy - 64); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 22, yy - 70); ctx.lineTo(cx + 14, yy - 86); ctx.lineTo(cx + 8, yy - 64); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d69a7a";
    ctx.beginPath();
    ctx.moveTo(cx - 18, yy - 72); ctx.lineTo(cx - 14, yy - 82); ctx.lineTo(cx - 10, yy - 66); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 18, yy - 72); ctx.lineTo(cx + 14, yy - 82); ctx.lineTo(cx + 10, yy - 66); ctx.closePath();
    ctx.fill();
    // snout
    ctx.fillStyle = "#b08860";
    ctx.beginPath();
    ctx.ellipse(cx, yy - 68, 9, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes — angry wild look
    ctx.fillStyle = "#f4c030";
    ctx.beginPath();
    ctx.arc(cx - 9, yy - 55, 3, 0, Math.PI * 2);
    ctx.arc(cx + 9, yy - 55, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(cx - 9, yy - 55, 1.4, 0, Math.PI * 2);
    ctx.arc(cx + 9, yy - 55, 1.4, 0, Math.PI * 2);
    ctx.fill();
    // nose
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.ellipse(cx, yy - 75, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // fangs (고라니 특징 — 위턱에서 살짝 나온 송곳니)
    ctx.fillStyle = "#f8f4e8";
    ctx.beginPath();
    ctx.moveTo(cx - 5, yy - 70); ctx.lineTo(cx - 6, yy - 62); ctx.lineTo(cx - 3, yy - 70); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 5, yy - 70); ctx.lineTo(cx + 6, yy - 62); ctx.lineTo(cx + 3, yy - 70); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBonus(o) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const t = performance.now() / 500 + o.phase;
    // pink heart aura around bonus pickups
    ctx.fillStyle = "rgba(255, 120, 160, 0.55)";
    for (let i = 0; i < 4; i++) {
      const a = t + i * Math.PI / 2;
      const hx = cx + Math.cos(a) * (o.w / 2 + 12);
      const hy = cy + Math.sin(a) * (o.h / 2 + 8);
      ctx.beginPath();
      ctx.arc(hx - 5, hy, 6, 0, Math.PI * 2);
      ctx.arc(hx + 5, hy, 6, 0, Math.PI * 2);
      ctx.moveTo(hx - 11, hy + 2);
      ctx.lineTo(hx, hy + 14);
      ctx.lineTo(hx + 11, hy + 2);
      ctx.fill();
    }
    // gentle bob
    const bob = Math.sin(t * 1.3) * 3;
    const yy = cy + bob;
    if (o.sub === "bread") {
      // bread bonus — warm brown round bread with light highlights
      ctx.fillStyle = "#8a4a1a";
      ctx.beginPath();
      ctx.ellipse(cx, yy, 28, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      // crusty top texture
      ctx.fillStyle = "#b86a28";
      for (let r = 0; r < 10; r++) {
        const ang = r * 0.7;
        const rx = cx + Math.cos(ang) * 16;
        const ry = yy + Math.sin(ang) * 10 - 4;
        ctx.beginPath(); ctx.arc(rx, ry, 4, 0, Math.PI * 2); ctx.fill();
      }
      // highlight
      ctx.fillStyle = "rgba(255, 220, 150, 0.55)";
      ctx.beginPath();
      ctx.ellipse(cx - 8, yy - 8, 10, 4, -0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.sub === "bone") {
      // dog bone — two rounded knobs with a shaft
      ctx.save();
      ctx.translate(cx, yy);
      ctx.rotate(Math.sin(t * 0.6) * 0.15);
      ctx.fillStyle = "#f6ecd2";
      roundRect(-26, -8, 52, 16, 8); ctx.fill();
      ctx.beginPath();
      ctx.arc(-26, -6, 9, 0, Math.PI * 2);
      ctx.arc(-26, 6, 9, 0, Math.PI * 2);
      ctx.arc(26, -6, 9, 0, Math.PI * 2);
      ctx.arc(26, 6, 9, 0, Math.PI * 2);
      ctx.fill();
      // shading
      ctx.fillStyle = "rgba(180, 160, 110, 0.4)";
      roundRect(-22, 2, 44, 5, 3); ctx.fill();
      ctx.restore();
    } else if (o.sub === "chew") {
      // dog chew — twisted rawhide stick
      ctx.save();
      ctx.translate(cx, yy);
      ctx.rotate(-0.3);
      ctx.fillStyle = "#e8cfa2";
      roundRect(-26, -8, 52, 16, 6); ctx.fill();
      // twisted ends
      ctx.beginPath();
      ctx.arc(-26, 0, 10, 0, Math.PI * 2);
      ctx.arc(26, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      // swirl lines
      ctx.strokeStyle = "#b08848"; ctx.lineWidth = 1.5;
      for (let i = -20; i <= 20; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, -7);
        ctx.quadraticCurveTo(i + 4, 0, i, 7);
        ctx.stroke();
      }
      ctx.restore();
    } else if (o.sub === "hotdog") {
      // hotdog — bun with sausage and mustard zigzag
      ctx.save();
      ctx.translate(cx, yy);
      ctx.rotate(-0.15);
      // bottom bun
      ctx.fillStyle = "#d9a658";
      roundRect(-30, 2, 60, 14, 6); ctx.fill();
      // top bun
      ctx.fillStyle = "#e6b870";
      roundRect(-30, -14, 60, 14, 6); ctx.fill();
      // sausage peeking out
      ctx.fillStyle = "#c4523a";
      roundRect(-26, -6, 52, 10, 5); ctx.fill();
      ctx.fillStyle = "#8a2e1e";
      roundRect(-26, -5, 52, 2, 1); ctx.fill();
      // mustard zigzag
      ctx.strokeStyle = "#ffce2a"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-22, -1);
      ctx.lineTo(-12, -3);
      ctx.lineTo(-2, -1);
      ctx.lineTo(8, -3);
      ctx.lineTo(18, -1);
      ctx.stroke();
      // sesame seeds on top bun
      ctx.fillStyle = "#f6ecc0";
      for (const sx of [-18, -6, 6, 18]) {
        ctx.beginPath();
        ctx.ellipse(sx, -10, 1.8, 1, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawScoreFloats() {
    for (const f of state.scoreFloats) {
      const alpha = 1 - f.t;
      const dy = -60 * f.t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffd84a";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 4;
      ctx.font = "bold 36px 'Apple SD Gothic Neo', sans-serif";
      ctx.textAlign = "center";
      ctx.strokeText(f.text, f.x, f.y + dy);
      ctx.fillText(f.text, f.x, f.y + dy);
      ctx.restore();
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
    // use a monotonic timebase so the fleet doesn't jump when phaseT resets between approach→boss
    const tNow = performance.now() / 1000;
    for (const s of fleet) {
      const r = rows[s.row];
      const len = 160 * r.scale;
      const ht = 34 * r.scale;
      const travel = (W + len + 200);
      const raw = (tNow * r.speed + s.offset) % travel;
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
    if (b.dead) {
      // rotate + wobble during fall
      const rot = Math.min(b.deadT * 2.2, Math.PI);
      ctx.translate(b.x, b.y + b.h * 0.5);
      ctx.rotate(rot);
      ctx.translate(-b.x, -(b.y + b.h * 0.5));
    }
    if (b.bossPhase === 1) drawIranBoss(b);
    else drawTrumpBoss(b);
    ctx.restore();

    // death flash + stars (drawn in screen space, not rotated)
    if (b.dead) {
      const pt = b.deadT;
      if (pt < 0.3) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 0.7 - pt * 2)})`;
        ctx.fillRect(0, 0, W, H);
      }
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

  function drawIranBoss(b) {
    // 해협 수문장 — 단순화 (카키 군복 + 베레만, 얼굴은 황금머리와 같은 톤)
    const cx = b.x;
    const y = b.y;
    // body / uniform
    ctx.fillStyle = "#5a5c3a";
    roundRect(cx - b.w / 2 + 20, y + b.h * 0.55, b.w - 40, b.h * 0.45, 20);
    ctx.fill();
    // 앞섶 가운데 라인
    ctx.fillStyle = "#44462a";
    ctx.fillRect(cx - 2, y + b.h * 0.58, 4, b.h * 0.4);
    // 금 버튼 3개
    ctx.fillStyle = "#e8c04a";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, y + b.h * 0.64 + i * 20, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // head — 중동 피부톤 (올리브 탠, 트럼프보다 어둡게)
    ctx.fillStyle = "#b8895c";
    ctx.beginPath();
    ctx.ellipse(cx, y + b.h * 0.4, 90, 72, 0, 0, Math.PI * 2);
    ctx.fill();
    // jowl shadow
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(cx, y + b.h * 0.5, 80, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    // 베레 — 단순한 한 덩어리
    ctx.fillStyle = "#2a2e16";
    ctx.beginPath();
    ctx.ellipse(cx, y + b.h * 0.22, 96, 34, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 96, y + b.h * 0.22, 192, 6);
    // 빨간 엠블럼
    ctx.fillStyle = "#c62a2a";
    ctx.beginPath();
    ctx.arc(cx - 44, y + b.h * 0.18, 6, 0, Math.PI * 2);
    ctx.fill();
    // 굵은 검은 눈썹 (페르시안 느낌 — 한 줄 라인으로 단순 유지)
    ctx.fillStyle = "#1a1208";
    roundRect(cx - 40, y + b.h * 0.34, 22, 5, 2); ctx.fill();
    roundRect(cx + 18, y + b.h * 0.34, 22, 5, 2); ctx.fill();
    // 검은 점 눈 (squint line 대신 동일 카운트)
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(cx - 27, y + b.h * 0.4, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 27, y + b.h * 0.4, 3.5, 0, Math.PI * 2); ctx.fill();
    // 짙은 콧수염 (입 rect 대신 — 동일 요소 1개)
    ctx.fillStyle = "#1a1208";
    roundRect(cx - 22, y + b.h * 0.47, 44, 7, 3); ctx.fill();
    // arms out
    ctx.fillStyle = "#5a5c3a";
    roundRect(cx - b.w / 2 - 10, y + b.h * 0.55, 70, 40, 14);
    ctx.fill();
    roundRect(cx + b.w / 2 - 60, y + b.h * 0.55, 70, 40, 14);
    ctx.fill();
    // hands
    ctx.fillStyle = "#b8895c";
    ctx.beginPath(); ctx.arc(cx - b.w / 2 - 6, y + b.h * 0.75, 22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + b.w / 2 + 6, y + b.h * 0.75, 22, 0, Math.PI * 2); ctx.fill();
  }

  function drawTrumpBoss(b) {
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
    // 이마 위쪽에만 살짝 얹는 금발 스윕 — 머리 외곽 안에서 클리핑해서 가발처럼 얹지 않음
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, y + b.h * 0.4, 90, 72, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#e8b95a";
    ctx.beginPath();
    ctx.moveTo(cx - 100, y + b.h * 0.32);
    ctx.quadraticCurveTo(cx - 20, y + b.h * 0.36, cx + 40, y + b.h * 0.3);
    ctx.quadraticCurveTo(cx + 80, y + b.h * 0.27, cx + 100, y + b.h * 0.26);
    ctx.lineTo(cx + 100, y - 40);
    ctx.lineTo(cx - 100, y - 40);
    ctx.closePath();
    ctx.fill();
    // 앞머리 결 — 오른쪽으로 쓸리는 한 가닥 하이라이트
    ctx.strokeStyle = "rgba(255, 232, 160, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 60, y + b.h * 0.31);
    ctx.quadraticCurveTo(cx, y + b.h * 0.28, cx + 70, y + b.h * 0.27);
    ctx.stroke();
    ctx.restore();
    // squint eyes
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 36, y + b.h * 0.42);
    ctx.lineTo(cx - 18, y + b.h * 0.42);
    ctx.moveTo(cx + 18, y + b.h * 0.42);
    ctx.lineTo(cx + 36, y + b.h * 0.42);
    ctx.stroke();
    // mouth
    ctx.fillStyle = "#3a1f1f";
    roundRect(cx - 18, y + b.h * 0.5, 36, 10, 4);
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
  }

  function drawBossAnnounce() {
    const bn = state.bossBanner;
    if (!bn) return;
    // 페이드 인/아웃 × 깜박임 (경보 시그널 느낌)
    const tIn = Math.min(1, bn.t / 0.25);
    const tOut = Math.min(1, Math.max(0, (bn.total - bn.t) / 0.4));
    const blink = 0.6 + 0.4 * (Math.sin(bn.t * 10) > 0 ? 1 : 0); // 사각파 블링크
    const alpha = Math.min(tIn, tOut) * blink;
    if (alpha <= 0) return;

    const theme = bn.theme;
    const isWarn = theme === "warn"; // Iran — red/black
    // banner backdrop — full-width slash
    const bandY = H * 0.36;
    const bandH = 220;
    // diagonal dark backdrop
    ctx.save();
    ctx.globalAlpha = 0.7 * alpha;
    const bgGrad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
    if (isWarn) {
      bgGrad.addColorStop(0, "#1a0a0a");
      bgGrad.addColorStop(0.5, "#3a0a0a");
      bgGrad.addColorStop(1, "#1a0a0a");
    } else {
      bgGrad.addColorStop(0, "#0a1a28");
      bgGrad.addColorStop(0.5, "#14304a");
      bgGrad.addColorStop(1, "#0a1a28");
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, bandY, W, bandH);
    ctx.restore();

    // top/bottom accent bars
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = isWarn ? "#c0322a" : "#ffd84a";
    ctx.fillRect(0, bandY, W, 6);
    ctx.fillRect(0, bandY + bandH - 6, W, 6);

    // stripe pattern on the backdrop (barrier/caution feel for warn; currency dollar signs for counter)
    ctx.globalAlpha = 0.18 * alpha;
    if (isWarn) {
      ctx.fillStyle = "#ffd84a";
      for (let sx = -bandH; sx < W + bandH; sx += 50) {
        ctx.beginPath();
        ctx.moveTo(sx, bandY);
        ctx.lineTo(sx + 22, bandY);
        ctx.lineTo(sx + 22 + bandH, bandY + bandH);
        ctx.lineTo(sx + bandH, bandY + bandH);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#7ee0a1";
      ctx.font = "bold 64px sans-serif";
      ctx.textAlign = "center";
      for (let sx = 60; sx < W; sx += 130) {
        for (let sy = bandY + 40; sy < bandY + bandH; sy += 80) {
          ctx.fillText("$", sx, sy);
        }
      }
    }
    ctx.globalAlpha = alpha;

    // main title text
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isWarn ? "#ff7030" : "#ffd84a";
    ctx.font = "bold 74px 'Apple SD Gothic Neo', sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillText(bn.text, W / 2, bandY + bandH * 0.42);

    // sub line
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText(bn.sub, W / 2, bandY + bandH * 0.72);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  function render() {
    const sx = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    const sy = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
    drawBackground();
    for (const o of state.obstacles) drawObstacle(o);
    if (state.phase === "intro") drawIntroBg();
    drawPlayer();
    if (state.phase === "boss" || state.phase === "victory") drawBoss();
    for (const bt of state.bullets) drawBullet(bt);
    drawBossHp();
    drawBossAnnounce();
    drawScoreFloats();
    if (state.phase === "intro") drawIntroFg();
    if (state.phase === "outro") drawOutroBanner();
    ctx.restore();
  }

  function drawBossHp() {
    const b = state.boss;
    if (!b || b.dead || b.transitionT > 0) return;
    // 보스 머리 위에 떠 있는 HP바 — HUD/배경 배너와 겹치지 않음
    const barW = b.w + 20;
    const barH = 14;
    const barX = b.x - barW / 2;
    const barY = b.y - 34;
    // 배경
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(barX - 4, barY - 4, barW + 8, barH + 8, 6); ctx.fill();
    // 틀
    ctx.fillStyle = "#15151a";
    roundRect(barX, barY, barW, barH, 4); ctx.fill();
    // 체력 채움
    const ratio = Math.max(0, b.hp / b.hpMax);
    const fillW = Math.max(0, barW * ratio);
    const phase1 = b.bossPhase === 1;
    const fillGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    if (phase1) {
      fillGrad.addColorStop(0, "#ff6030");
      fillGrad.addColorStop(1, "#c02a10");
    } else {
      fillGrad.addColorStop(0, "#ffd84a");
      fillGrad.addColorStop(1, "#d08a10");
    }
    ctx.fillStyle = fillGrad;
    roundRect(barX, barY, fillW, barH, 4); ctx.fill();
    // 하이라이트
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(barX + 2, barY + 2, Math.max(0, fillW - 4), 3);
    // 라벨 — 바 바로 위에 작은 글씨로
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px 'Apple SD Gothic Neo', sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    const label = phase1 ? "해협 수문장" : "황금머리";
    ctx.fillText(label, b.x, barY - 6);
    ctx.shadowBlur = 0;
  }

  function drawIntroBg() {
    // dirt covers the full screen during intro; crossfades out at the end to reveal the gate+road
    const t = state.introT;
    // alpha: 1 until t=2.6, linearly 1→0 across 2.6→3.2
    const alpha = Math.max(0, Math.min(1, (INTRO_DURATION - t) / 0.6));
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    // main dirt ground — full screen
    ctx.fillStyle = "#7a5b3a";
    ctx.fillRect(0, 0, W, H);
    // grass patches scattered across
    ctx.fillStyle = "#5a7a3a";
    for (let gy = 80; gy < H; gy += 110) {
      for (let gx = 40 + ((gy * 31) % 60); gx < W; gx += 130) {
        ctx.beginPath();
        ctx.ellipse(gx, gy, 22, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // rocks
    ctx.fillStyle = "#8a7a5a";
    for (let i = 0; i < 12; i++) {
      const rx = (i * 167) % W;
      const ry = (i * 271) % H;
      ctx.beginPath();
      ctx.arc(rx, ry, 4 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    // 대전 동물원 arched entrance sign — big and clear so players know where they are
    const sgCx = W / 2;
    const sgTop = 18;
    const sgArchW = 520;
    const sgArchH = 96;
    // sign shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(sgCx, sgTop + sgArchH + 8, sgArchW / 2, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // support posts (left/right)
    ctx.fillStyle = "#4a3a22";
    ctx.fillRect(sgCx - sgArchW / 2 - 6, sgTop - 6, 18, 140);
    ctx.fillRect(sgCx + sgArchW / 2 - 12, sgTop - 6, 18, 140);
    // arch body — warm wooden plank with golden border
    const archGrad = ctx.createLinearGradient(0, sgTop, 0, sgTop + sgArchH);
    archGrad.addColorStop(0, "#8a5a2a");
    archGrad.addColorStop(0.5, "#6a3e18");
    archGrad.addColorStop(1, "#4a2a10");
    ctx.fillStyle = archGrad;
    roundRect(sgCx - sgArchW / 2, sgTop, sgArchW, sgArchH, 14); ctx.fill();
    // inner gold border
    ctx.strokeStyle = "#ffd84a";
    ctx.lineWidth = 3;
    roundRect(sgCx - sgArchW / 2 + 6, sgTop + 6, sgArchW - 12, sgArchH - 12, 10);
    ctx.stroke();
    // main text
    ctx.fillStyle = "#ffd84a";
    ctx.font = "bold 44px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 3;
    ctx.fillText("대전 동물원", sgCx, sgTop + sgArchH * 0.42);
    ctx.shadowOffsetY = 0;
    // subtitle
    ctx.fillStyle = "#f5e2a8";
    ctx.font = "bold 16px ui-monospace, 'SF Mono', Menlo, monospace";
    ctx.fillText("DAEJEON ZOO", sgCx, sgTop + sgArchH * 0.78);
    ctx.textBaseline = "alphabetic";
    // paw-print decorations on both sides of the text
    ctx.fillStyle = "#ffd84a";
    for (const pawX of [sgCx - sgArchW / 2 + 40, sgCx + sgArchW / 2 - 40]) {
      const pawY = sgTop + sgArchH * 0.5;
      ctx.beginPath(); ctx.arc(pawX, pawY, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pawX - 8, pawY - 8, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pawX, pawY - 10, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pawX + 8, pawY - 8, 3, 0, Math.PI * 2); ctx.fill();
    }

    // zoo cage bars — heavy iron bars between wolf and outside
    const barTop = 140;
    const barBottom = 420;
    const railH = 18;
    // top rail (concrete/painted frame)
    const topRail = ctx.createLinearGradient(0, barTop, 0, barTop + railH);
    topRail.addColorStop(0, "#6a5a46");
    topRail.addColorStop(1, "#3a2e20");
    ctx.fillStyle = topRail;
    ctx.fillRect(0, barTop, W, railH);
    // bottom rail
    const botRail = ctx.createLinearGradient(0, barBottom - railH, 0, barBottom);
    botRail.addColorStop(0, "#3a2e20");
    botRail.addColorStop(1, "#6a5a46");
    ctx.fillStyle = botRail;
    ctx.fillRect(0, barBottom - railH, W, railH);
    // rivets on rails
    ctx.fillStyle = "#1a1208";
    for (let rx = 26; rx < W; rx += 54) {
      ctx.beginPath(); ctx.arc(rx, barTop + railH / 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rx, barBottom - railH / 2, 3, 0, Math.PI * 2); ctx.fill();
    }
    // vertical bars — thick iron with shadow + highlight for 3D feel
    const barSpacing = 44;
    const barWidth = 14;
    const barYTop = barTop + railH;
    const barYBot = barBottom - railH;
    for (let fx = 18; fx < W; fx += barSpacing) {
      // cast shadow on the ground behind
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(fx + 4, barYTop + 4, barWidth, barYBot - barYTop);
      // bar body
      const barGrad = ctx.createLinearGradient(fx, 0, fx + barWidth, 0);
      barGrad.addColorStop(0, "#1a1208");
      barGrad.addColorStop(0.4, "#4a3a28");
      barGrad.addColorStop(0.6, "#6a5a42");
      barGrad.addColorStop(1, "#2a1e12");
      ctx.fillStyle = barGrad;
      ctx.fillRect(fx, barYTop, barWidth, barYBot - barYTop);
      // rust spots
      ctx.fillStyle = "rgba(140, 70, 30, 0.55)";
      ctx.fillRect(fx + 2, barYTop + 40, 3, 18);
      ctx.fillRect(fx + 8, barYTop + 120, 2, 14);
      ctx.fillRect(fx + 3, barYTop + 200, 3, 10);
    }
    // chain-link pattern in the gaps between bars (subtle, darker tone)
    ctx.strokeStyle = "rgba(30, 20, 12, 0.32)";
    ctx.lineWidth = 1;
    for (let fx = 18 + barWidth + 4; fx < W; fx += barSpacing) {
      for (let ly = barYTop + 8; ly < barYBot; ly += 12) {
        ctx.beginPath();
        ctx.moveTo(fx, ly);
        ctx.lineTo(fx + (barSpacing - barWidth - 8), ly + 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(fx, ly + 6);
        ctx.lineTo(fx + (barSpacing - barWidth - 8), ly);
        ctx.stroke();
      }
    }
    // warning sign bolted to the bars
    const sx = W * 0.5 - 56, sy = barTop + 30;
    ctx.fillStyle = "#ffd42a";
    roundRect(sx, sy, 112, 44, 3); ctx.fill();
    ctx.strokeStyle = "#1a1208"; ctx.lineWidth = 3;
    roundRect(sx, sy, 112, 44, 3); ctx.stroke();
    ctx.fillStyle = "#1a1208";
    ctx.font = "bold 22px 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("위험·맹수", sx + 56, sy + 22);
    ctx.textBaseline = "alphabetic";
    // hole + dirt mound around the wolf
    const digT = Math.min(1, t / 1.8);
    const holeX = state.player.x;
    const holeY = PLAYER_Y + 28;
    const holeR = 76 * digT;
    if (holeR > 4) {
      ctx.fillStyle = "#1a0e08";
      ctx.beginPath();
      ctx.ellipse(holeX, holeY, holeR, holeR * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5a4028";
      ctx.beginPath();
      ctx.ellipse(holeX - holeR * 0.7, holeY - 6, holeR * 0.5, holeR * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(holeX + holeR * 0.7, holeY - 6, holeR * 0.5, holeR * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a6a3a";
      ctx.beginPath();
      ctx.ellipse(holeX - holeR * 0.7, holeY - 12, holeR * 0.45, holeR * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(holeX + holeR * 0.7, holeY - 12, holeR * 0.45, holeR * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawIntroFg() {
    const t = state.introT;
    const holeX = state.player.x;
    // dirt particle spray while digging
    if (t < 1.8) {
      ctx.fillStyle = "#6a4a28";
      for (let i = 0; i < 12; i++) {
        const sa = t * 10 + i * 0.7;
        const side = i % 2 === 0 ? -1 : 1;
        const ang = side * (0.3 + (sa % 1.0) * 0.8);
        const dist = 30 + ((sa * 70) % 70);
        const dx = holeX + Math.cos(ang) * dist * side;
        const dy = PLAYER_Y - 30 - Math.sin(Math.abs(ang)) * dist;
        ctx.fillRect(dx, dy, 3, 3);
      }
    }
    // hint text (only during digging phase) — below the cage, above the wolf
    if (t < 2.0) {
      ctx.fillStyle = `rgba(255, 220, 80, ${0.8 + Math.sin(t * 8) * 0.2})`;
      ctx.font = "bold 28px 'Apple SD Gothic Neo', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("땅굴을 파는 중…", W / 2, 560);
    }
  }

  function drawOutroBanner() {
    const t = state.outroT;
    const alpha = Math.min(1, t * 2) * Math.min(1, (2.6 - t) * 3);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * alpha})`;
    ctx.fillRect(0, H * 0.18, W, 130);
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(255, 220, 80, ${alpha})`;
    ctx.font = "bold 56px 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText("호르무즈 돌파!", W / 2, H * 0.26);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("끝없는 바다 너머로…", W / 2, H * 0.31);
  }

  function loop(t) {
    if (state.paused) {
      state.lastT = t;
      requestAnimationFrame(loop);
      return;
    }
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
    if (!state.running || state.paused) return;
    state.pointerActive = true;
    state.player.targetX = canvasXFromEvent(e);
  }
  function onPointerMove(e) {
    if (!state.pointerActive) return;
    if (state.paused) return;
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

  function showToast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 1800);
  }

  async function shareResult(kind) {
    const url = window.location.origin + window.location.pathname;
    const score = state.score;
    let text;
    if (kind === "victory") {
      text = `자유를 찾아 떠난 늑구, 엔딩까지 돌파! 🐺 최종 ${score}점`;
    } else {
      text = `자유를 향해 ${score}점... 늑구런에서 잡혔다 🐺 너는 얼마나 가?`;
    }
    const fullText = `${text}\n${url}`;
    audio.ensure();
    audio.sfx.tap();
    if (navigator.share) {
      try {
        await navigator.share({ title: "늑구런", text, url });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(fullText);
      showToast("링크가 복사됐어요!");
    } catch (e) {
      showToast("복사 실패 — 브라우저 주소창 URL을 공유해줘");
    }
  }

  let hiddenTrack = null;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenTrack = audio.currentTrack();
      audio.stopBgm();
      audio.suspend();
    } else {
      audio.resume();
      if (hiddenTrack && state.running && !state.paused && !audio.isMuted()) {
        audio.startBgm(hiddenTrack);
      }
      hiddenTrack = null;
      checkVersion();
    }
  });

  const CURRENT_VERSION = "v1.4.47";
  let updateBannerShown = false;
  async function checkVersion() {
    if (updateBannerShown) return;
    try {
      const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      if (data && data.version && data.version !== CURRENT_VERSION) {
        showUpdateBanner();
      }
    } catch (e) { /* offline — ignore */ }
  }
  function showUpdateBanner() {
    if (updateBannerShown) return;
    updateBannerShown = true;
    const b = document.createElement("div");
    b.className = "update-banner";
    b.innerHTML = '<span>🎉 새 버전이 나왔어요</span>' +
      '<button class="update-reload">새로고침</button>' +
      '<button class="update-dismiss" aria-label="닫기">×</button>';
    document.body.appendChild(b);
    b.querySelector(".update-reload").addEventListener("click", (e) => {
      e.stopPropagation();
      location.reload();
    });
    b.querySelector(".update-dismiss").addEventListener("click", (e) => {
      e.stopPropagation();
      b.classList.remove("show");
      setTimeout(() => b.remove(), 300);
    });
    requestAnimationFrame(() => b.classList.add("show"));
  }
  setTimeout(checkVersion, 60_000);
  setInterval(checkVersion, 5 * 60_000);

  document.getElementById("start-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    audio.ensure();
    audio.sfx.tap();
    start();
  });
  // 프리뷰 전용 디버그 패널 (보스전·크레딧 바로가기)
  const debugPanel = document.getElementById("debug-panel");
  if (IS_PREVIEW && debugPanel) debugPanel.classList.remove("hidden");
  const skipBossBtn = document.getElementById("skip-boss-btn");
  if (skipBossBtn) {
    skipBossBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      audio.ensure();
      audio.sfx.tap();
      start();
      state.distance = BOSS_DIST - 10;
      state.sungsimdangSpawned = true;
      state.stadiumSpawned = true;
      state.hanbitSpawned = true;
      state.exitGateSpawned = true;
      state.phase = "intro";
      state.introT = INTRO_DURATION;
    });
  }
  const skipCreditsBtn = document.getElementById("skip-credits-btn");
  if (skipCreditsBtn) {
    skipCreditsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      audio.ensure();
      audio.sfx.tap();
      start();
      state.running = false;
      startOverlay.classList.add("hidden");
      victory();
    });
  }
  document.getElementById("restart-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    audio.ensure();
    audio.sfx.tap();
    start();
  });
  document.getElementById("credits-restart-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    audio.ensure();
    audio.sfx.tap();
    creditsOverlay.classList.add("hidden");
    start();
  });
  document.getElementById("share-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    shareResult("gameover");
  });
  document.getElementById("credits-share-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    shareResult("victory");
  });

  const muteBtn = document.getElementById("mute-btn");
  function refreshMuteIcon() {
    muteBtn.textContent = audio.isMuted() ? "🔇" : "🔊";
  }
  refreshMuteIcon();
  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.ensure();
    const nextMuted = !audio.isMuted();
    audio.setMuted(nextMuted);
    refreshMuteIcon();
    if (!nextMuted) audio.sfx.tap();
  });

  const pauseBtn = document.getElementById("pause-btn");
  function refreshPauseIcon() {
    pauseBtn.textContent = state.paused ? "▶" : "⏸";
  }
  function pauseGame() {
    if (!state.running || state.paused) return;
    state.paused = true;
    pausedTrack = audio.currentTrack();
    audio.stopBgm();
    audio.suspend();
    pauseOverlay.classList.remove("hidden");
    refreshPauseIcon();
  }
  function resumeGame() {
    if (!state.paused) return;
    state.paused = false;
    audio.resume();
    if (pausedTrack && !audio.isMuted()) audio.startBgm(pausedTrack);
    pausedTrack = null;
    pauseOverlay.classList.add("hidden");
    state.lastT = performance.now();
    refreshPauseIcon();
  }
  let pausedTrack = null;
  refreshPauseIcon();
  pauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!state.running) return;
    audio.ensure();
    audio.sfx.tap();
    if (state.paused) resumeGame(); else pauseGame();
  });
  document.getElementById("resume-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    audio.ensure();
    audio.sfx.tap();
    resumeGame();
  });

  state.scenery = seedScenery();
  render();
})();
