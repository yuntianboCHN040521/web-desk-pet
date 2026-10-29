/*!
 * web-desk-pet · 启动与交互
 *
 * 负责：画布缩放、主循环、鼠标/触摸输入、喂食、存档、HUD。
 */
(function (global) {
  'use strict';

  const PET = global.PET;
  const D = PET.draw;
  const C = PET.COLORS;
  const clamp = PET.math.clamp;
  const W = PET.VIEW_W;
  const H = PET.VIEW_H;
  const GROUND = PET.GROUND_Y;

  const SAVE_KEY = 'web-desk-pet/v1';
  const HOUR_MS = 3600 * 1000;

  let canvas = null;
  let ctx = null;
  let cat = null;
  let fish = null;
  let scale = 1;

  let time = 0;
  let lastFrame = 0;

  /* 鼠标 / 触摸在场景坐标系里的位置 */
  const pointer = { x: 160, y: 90, active: false, down: false };
  /* 按下时的位置与时间，用来区分「点一下」和「拖拽」 */
  const press = { x: 0, y: 0, t: 0, onCat: false };

  /* ---------------------------------------------------------
     存档
     --------------------------------------------------------- */
  function loadSave() {
    try {
      const raw = global.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  function persist() {
    if (!cat) return;
    try {
      global.localStorage.setItem(SAVE_KEY, JSON.stringify({
        affection: Math.round(cat.affection),
        fullness: Math.round(cat.fullness),
        savedAt: Date.now(),
        x: Math.round(cat.x)
      }));
    } catch (err) {
      /* 隐私模式下 localStorage 会抛错，静默忽略即可 */
    }
  }

  /* ---------------------------------------------------------
     画布尺寸：优先整数倍放大，保证像素不糊
     --------------------------------------------------------- */
  function resize() {
    const vw = global.innerWidth;
    const vh = global.innerHeight;
    const fit = Math.min(vw / W, vh / H);
    /* 整数倍最干净；只有整数倍会让画面缩得太小时才退回浮点铺满 */
    let s = Math.floor(fit);
    if (s < 1) {
      s = Math.max(0.5, fit);
    } else if (s / fit < 0.75) {
      s = fit;
    }
    scale = s;
    canvas.style.width = Math.round(W * s) + 'px';
    canvas.style.height = Math.round(H * s) + 'px';
  }

  /** 屏幕坐标 → 场景坐标 */
  function toScene(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H
    };
  }

  /** 点是否落在猫身上 */
  function hitCat(x, y) {
    const b = cat.bounds();
    /* 留一点余量，手感更宽容 */
    return x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 6;
  }

  /* ---------------------------------------------------------
     喂食
     --------------------------------------------------------- */
  function dropFish() {
    if (fish) return;
    if (cat.state === 'sleep') cat.wake();
    /* 把鱼丢在猫旁边一点的位置 */
    const dir = Math.random() < 0.5 ? -1 : 1;
    fish = {
      x: clamp(cat.x + dir * (34 + Math.random() * 24), PET.CAT_METRICS.MIN_X, PET.CAT_METRICS.MAX_X),
      y: GROUND - 2
    };
    cat.thinkTimer = 0.2;
  }

  function drawFish(ctx, f, t) {
    const x = Math.round(f.x);
    const y = Math.round(f.y + Math.sin(t * 3.4) * 1);
    /* 影 */
    ctx.globalAlpha = 0.25;
    D.ellipse(ctx, x + 1, GROUND + 1, 7, 2, '#000');
    ctx.globalAlpha = 1;
    /* 身子 */
    D.ellipse(ctx, x - 1, y, 6, 3.4, C.fish);
    D.ellipse(ctx, x - 2, y + 1, 3, 1.6, C.fishBelly);
    /* 尾巴 */
    D.triangle(ctx, x + 4, y, x + 10, y - 4, x + 10, y + 4, C.fish);
    /* 眼睛 */
    D.pixel(ctx, x - 4, y - 1, C.fishDark);
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------
     HUD
     --------------------------------------------------------- */
  let hudCache = { affection: -1, fullness: -1 };

  function updateHud() {
    const a = Math.round(cat.affection);
    const f = Math.round(cat.fullness);

    if (a !== hudCache.affection) {
      hudCache.affection = a;
      const bar = document.getElementById('bar-affection');
      const num = document.getElementById('num-affection');
      if (bar) bar.style.width = a + '%';
      if (num) num.textContent = String(a);
    }
    if (f !== hudCache.fullness) {
      hudCache.fullness = f;
      const bar = document.getElementById('bar-fullness');
      const num = document.getElementById('num-fullness');
      if (bar) bar.style.width = f + '%';
      if (num) num.textContent = String(f);
    }
  }

  /* ---------------------------------------------------------
     环境：深夜越困
     --------------------------------------------------------- */
  function computeSleepiness() {
    let s = 0.08;
    const h = new Date().getHours();
    if (h >= 23 || h < 5) s = 0.9;
    else if (h >= 22 || h < 6) s = 0.68;
    else if (h >= 20 || h < 8) s = 0.34;
    if (global.document.hidden) s = Math.max(s, 0.6);
    return s;
  }

  /* ---------------------------------------------------------
     主循环
     --------------------------------------------------------- */
  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    time += dt;

    const sleepiness = computeSleepiness();

    /* 视线：猫看向鼠标 */
    if (pointer.active) {
      const dx = pointer.x - cat.x;
      const dy = pointer.y - (cat.spriteTop + 14);
      cat.lookTargetX = clamp(dx / 70, -1, 1);
      cat.lookTargetY = clamp(dy / 46, -1, 1);
    } else {
      cat.lookTargetX = 0;
      cat.lookTargetY = 0;
    }

    /* 喂食：猫会主动走过去吃掉 */
    if (fish && !cat.dragging && cat.state !== 'held') {
      const dx = fish.x - cat.x;
      if (Math.abs(dx) > 7) {
        cat.targetX = fish.x;
        if (cat.state !== 'walk') cat.setState('walk');
        cat.thinkTimer = Math.max(cat.thinkTimer, 1);
      } else {
        fish = null;
        cat.eat();
        cat.affection = clamp(cat.affection + 2, 0, 100);
        persist();
      }
    }

    cat.update(dt, {
      sleepiness: sleepiness,
      mouseX: pointer.x,
      mouseY: pointer.y,
      mouseActive: pointer.active
    });

    /* 饱食度缓慢下降：满值掉到 0 大约要 7 小时，别让它几分钟就饿死 */
    cat.fullness = clamp(cat.fullness - dt * 0.004, 0, 100);

    /* ---- 绘制 ---- */
    ctx.clearRect(0, 0, W, H);
    PET.Scene.draw(ctx, time, sleepiness);

    if (fish) drawFish(ctx, fish, time);

    cat.draw(ctx, time);
    cat.drawEffects(ctx, time);

    updateHud();
    global.requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------
     输入
     --------------------------------------------------------- */
  function onPointerMove(e) {
    const p = toScene(e.clientX, e.clientY);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.active = true;
    if (cat.dragging) {
      /* 抓在猫身上时跟随，拖到画布外也不会瞬移 */
      pointer.x = clamp(p.x, -20, W + 20);
      pointer.y = clamp(p.y, -20, H + 20);
    }
  }

  function onPointerDown(e) {
    const p = toScene(e.clientX, e.clientY);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.down = true;

    press.x = p.x;
    press.y = p.y;
    press.t = global.performance.now();
    press.onCat = hitCat(p.x, p.y);

    if (press.onCat) {
      cat.wake();
      cat.grab(p.x, p.y);
    }

    if (e.pointerType === 'touch') e.preventDefault();
  }

  function onPointerUp(e) {
    pointer.down = false;
    if (!press.onCat) return;

    const p = toScene(e.clientX, e.clientY);
    const moved = Math.hypot(p.x - press.x, p.y - press.y);
    const elapsed = global.performance.now() - press.t;

    if (moved < 6 && elapsed < 400) {
      /* 轻点 = 抚摸 */
      cat.release();
      cat.pet();
    } else {
      cat.release();
    }
    persist();
  }

  /* ---------------------------------------------------------
     启动
     --------------------------------------------------------- */
  function boot() {
    canvas = document.getElementById('screen');
    ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    cat = new PET.Cat();

    /* 读档：离线期间会饿，但一下掉光就太狠了 */
    const save = loadSave();
    if (save) {
      cat.affection = clamp(Number(save.affection) || 0, 0, 100);
      const away = Math.max(0, (Date.now() - (Number(save.savedAt) || Date.now())));
      const hours = away / HOUR_MS;
      const hunger = Math.min(45, hours * 5);
      cat.fullness = clamp((Number(save.fullness) || 60) - hunger, 5, 100);
      if (typeof save.x === 'number') {
        cat.x = clamp(save.x, PET.CAT_METRICS.MIN_X, PET.CAT_METRICS.MAX_X);
      }
    }

    PET.Scene.build();
    resize();

    global.addEventListener('resize', resize);
    global.addEventListener('orientationchange', resize);

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    global.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', function () { pointer.active = false; });
    global.addEventListener('contextmenu', function (e) {
      /* 右键投喂，方便一点 */
      e.preventDefault();
      dropFish();
    });

    const feedBtn = document.getElementById('feed-btn');
    if (feedBtn) {
      feedBtn.addEventListener('click', function (e) {
        e.preventDefault();
        dropFish();
      });
    }

    global.setInterval(persist, 10000);
    global.addEventListener('beforeunload', persist);
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.hidden) persist();
    });

    /* 键 1 也可以喂 */
    global.addEventListener('keydown', function (e) {
      if (e.key === '1') dropFish();
    });

    lastFrame = global.performance.now();
    global.requestAnimationFrame(frame);

    /* 第一次见面：让它叫一声（冒爱心） */
    if (!save) {
      global.setTimeout(function () { cat.pet(); }, 900);
    }
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
