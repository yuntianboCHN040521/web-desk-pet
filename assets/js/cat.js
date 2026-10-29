/*!
 * web-desk-pet · 像素猫
 *
 * 照着用户家那只狸花猫画的：棕灰虎斑、白口鼻白胸白爪、绿眼睛。
 * 没有图片资源，所有形状都是几何原语叠出来的，
 * 所以任何分辨率下都不会糊，也不存在二创版权问题。
 *
 * 精灵画布 64 x 60 逻辑像素，脚底在 y=58。
 */
(function (global) {
  'use strict';

  const PET = global.PET;
  const D = PET.draw;
  const C = PET.COLORS;
  const GROUND = PET.GROUND_Y;
  const clamp = PET.math.clamp;

  const SPRITE_W = 64;
  const SPRITE_H = 60;
  const FOOT_OFFSET = 58; /* 脚底相对精灵顶部的偏移 */
  const MIN_X = 36;
  const MAX_X = 284;

  /* 7x6 的像素爱心，开心的时候从头顶飘起来 */
  const HEART = [
    '.##.##.',
    '#######',
    '#######',
    '.#####.',
    '..###..',
    '...#...'
  ];

  function drawHeart(ctx, x, y, color) {
    for (let r = 0; r < HEART.length; r++) {
      const row = HEART[r];
      for (let c = 0; c < row.length; c++) {
        if (row.charAt(c) === '#') D.pixel(ctx, x + c, y + r, color);
      }
    }
  }

  /**
   * 眼睛。mode: 'normal' | 'closed' | 'happy' | 'wide'
   * 真猫的眼睛又圆又大：绿色虹膜 + 黑色竖瞳 + 高光。
   */
  function drawEye(ctx, ex, ey, look, mode) {
    if (mode === 'closed') {
      /* 睡着：一条向下弯的弧线 */
      D.rect(ctx, ex - 3, ey + 1, 7, 1, C.eye);
      D.pixel(ctx, ex - 4, ey + 2, C.eye);
      D.pixel(ctx, ex + 4, ey + 2, C.eye);
      return;
    }
    if (mode === 'happy') {
      /* ^ ^ 形状：一条横线 + 两端上翘 */
      D.rect(ctx, ex - 2, ey + 1, 5, 1, C.eye);
      D.pixel(ctx, ex - 3, ey, C.eye);
      D.pixel(ctx, ex + 3, ey, C.eye);
      return;
    }
    if (mode === 'wide') {
      D.ellipse(ctx, ex, ey, 4.4, 5, C.eyeIris);
      D.rect(ctx, ex - 1, ey - 2.5, 2, 5, C.eye);
      D.rect(ctx, ex - 2.5, ey - 3, 2, 2, C.eyeGlow);
      return;
    }
    const x = ex + Math.round(look.x * 1.6);
    const y = ey + Math.round(look.y * 1.2);
    /* 眼眶的深色，让眼睛在浅色脸上立得住 */
    D.ellipse(ctx, x, y, 3.8, 4.4, C.furDark);
    D.ellipse(ctx, x, y, 3.4, 3.9, C.eyeIris);
    /* 竖瞳 */
    D.rect(ctx, x - 1, y - 2, 2, 4, C.eye);
    /* 高光 */
    D.rect(ctx, x - 2, y - 2.5, 2, 2, C.eyeGlow);
  }

  /** 一对耳朵（正面视角），带粉色耳内。往两边让开，额头才留得出地方画 M 纹 */
  function drawEars(ctx, ox, oy) {
    /* 左耳 */
    D.triangle(ctx, ox + 21, oy + 3, ox + 13, oy + 18, ox + 29, oy + 13, C.furMid);
    D.triangle(ctx, ox + 21, oy + 7, ox + 16, oy + 16, ox + 26, oy + 13, C.pink);
    /* 右耳 */
    D.triangle(ctx, ox + 43, oy + 3, ox + 51, oy + 18, ox + 35, oy + 13, C.furMid);
    D.triangle(ctx, ox + 43, oy + 7, ox + 48, oy + 16, ox + 38, oy + 13, C.pink);
  }

  /** 额头的虎斑 M 纹 + 两道眉上的短线，狸花猫的标志 */
  function drawHeadStripes(ctx, ox, oy) {
    /* 中间一竖最长 */
    D.rect(ctx, ox + 31, oy + 5, 2, 8, C.furDark);
    /* 两侧竖纹 */
    D.rect(ctx, ox + 28, oy + 7, 1, 5, C.furDark);
    D.rect(ctx, ox + 35, oy + 7, 1, 5, C.furDark);
    /* 下面两笔往中间收，凑出 M */
    D.rect(ctx, ox + 29, oy + 13, 1, 3, C.furDark);
    D.rect(ctx, ox + 34, oy + 13, 1, 3, C.furDark);
  }

  /** 脸颊两侧的浅色腮毛：淡淡一层，不能做成两块色斑 */
  function drawCheeks(ctx, ox, oy, hy) {
    ctx.globalAlpha = 0.4;
    D.ellipse(ctx, ox + 19, hy + 6, 4, 3, C.furLight);
    D.ellipse(ctx, ox + 45, hy + 6, 4, 3, C.furLight);
    ctx.globalAlpha = 1;
  }

  /** 鼻子 + 嘴 + 胡须 */
  function drawFace(ctx, ox, oy, mouthOpen) {
    /* 鼻子：粉色小三角 */
    D.rect(ctx, ox + 30, oy + 21, 4, 1, C.pinkDeep);
    D.rect(ctx, ox + 31, oy + 22, 2, 1, C.pinkDeep);
    /* 嘴：两条向下撇的短线，张嘴时中间裂开 */
    if (mouthOpen > 0) {
      D.rect(ctx, ox + 31, oy + 23, 2, 3, C.pinkDeep);
      D.rect(ctx, ox + 30, oy + 25, 4, 1, C.pinkDeep);
    } else {
      D.rect(ctx, ox + 29, oy + 24, 2, 1, C.furDark);
      D.rect(ctx, ox + 33, oy + 24, 2, 1, C.furDark);
      D.pixel(ctx, ox + 31, oy + 25, C.furDark);
      D.pixel(ctx, ox + 33, oy + 25, C.furDark);
    }
    /* 胡须：左右各两根，短一点才不像刺 */
    D.thickLine(ctx, ox + 27, oy + 23, ox + 15, oy + 21, 1, C.whisker);
    D.thickLine(ctx, ox + 27, oy + 25, ox + 14, oy + 27, 1, C.whisker);
    D.thickLine(ctx, ox + 37, oy + 23, ox + 49, oy + 21, 1, C.whisker);
    D.thickLine(ctx, ox + 37, oy + 25, ox + 50, oy + 27, 1, C.whisker);
  }

  /** 头（含白口鼻、腮毛、M 纹、耳朵、眼睛） */
  function drawHead(ctx, ox, oy, opts, bob) {
    const hy = oy + 17 + bob;

    /* 头：轻微竖椭圆，比正圆更像猫 */
    D.ellipse(ctx, ox + 32, hy, 14.5, 12.5, C.fur);
    /* 白色口鼻：只盖鼻子到下巴那一块 */
    D.ellipse(ctx, ox + 32, hy + 6, 7, 5, C.cream);
    /* 腮毛 */
    drawCheeks(ctx, ox, oy + bob, hy);
    /* 额头纹 */
    drawHeadStripes(ctx, ox, oy + bob);
    /* 耳朵压在头上 */
    drawEars(ctx, ox, oy + bob);

    /* 眼睛 */
    drawEye(ctx, ox + 26, hy, opts.look, opts.eyeMode);
    drawEye(ctx, ox + 38, hy, opts.look, opts.eyeMode);

    drawFace(ctx, ox, oy + bob, opts.mouthOpen);
  }

  /** 坐姿的下半身（身体、白胸、虎斑、前爪） */
  function drawBody(ctx, ox, oy, breathe) {
    /* 身体 */
    D.ellipse(ctx, ox + 32, oy + 42, 17, 14 + breathe, C.fur);
    /* 白色胸腹：从脖子一路铺到肚子 */
    D.ellipse(ctx, ox + 32, oy + 40, 9, 11 + breathe * 0.5, C.cream);
    /* 身体两侧的虎斑，三条 */
    D.rect(ctx, ox + 15, oy + 37, 7, 2, C.furDark);
    D.rect(ctx, ox + 42, oy + 37, 7, 2, C.furDark);
    D.rect(ctx, ox + 14, oy + 44, 6, 2, C.furDark);
    D.rect(ctx, ox + 44, oy + 44, 6, 2, C.furDark);
    D.rect(ctx, ox + 17, oy + 51, 5, 2, C.furDark);
    D.rect(ctx, ox + 42, oy + 51, 5, 2, C.furDark);
    /* 白前爪：先铺一层暗色当阴影再压上本体 */
    D.ellipse(ctx, ox + 24, oy + 56, 6.2, 3.6, C.creamDeep);
    D.ellipse(ctx, ox + 40, oy + 56, 6.2, 3.6, C.creamDeep);
    D.ellipse(ctx, ox + 24, oy + 55, 5.8, 3.2, C.cream);
    D.ellipse(ctx, ox + 40, oy + 55, 5.8, 3.2, C.cream);
    /* 脚趾缝 */
    D.rect(ctx, ox + 22, oy + 55, 1, 3, C.creamDeep);
    D.rect(ctx, ox + 38, oy + 55, 1, 3, C.creamDeep);
  }

  /* ==========================================================
     各种姿态
     ========================================================== */

  /** 坐着：待机、被摸、吃东西都基于这个姿态 */
  function drawSitting(ctx, ox, oy, opts) {
    const t = opts.time;
    const breathe = Math.sin(t * 2.1) * 1.1;
    const headDY = opts.headDY || 0;

    /* 尾巴先画，压在身体下面：尾尖白的，中段三道虎斑环 */
    const sway = Math.sin(t * 1.6) * 4;
    const tp0 = { x: ox + 44, y: oy + 46 };
    const tp1 = { x: ox + 60 + sway, y: oy + 50 };
    const tp2 = { x: ox + 57 + sway * 0.5, y: oy + 26 };
    D.bezierTail(ctx, tp0, tp1, tp2, 6, C.furMid);
    for (let i = 1; i <= 3; i++) {
      const p = D.quadPoint(0.36 + i * 0.17, tp0, tp1, tp2);
      D.rect(ctx, p.x - 3, p.y - 2, 6, 3, C.furDark);
    }
    D.ellipse(ctx, tp2.x, tp2.y - 2, 3, 3, C.cream);

    drawBody(ctx, ox, oy, breathe);
    drawHead(ctx, ox, oy, opts, headDY);

    /* 腮红：被摸开心的时候才出现 */
    if (opts.blush) {
      ctx.globalAlpha = 0.45;
      D.ellipse(ctx, ox + 20, oy + headDY + 23, 3.5, 2.2, C.pink);
      D.ellipse(ctx, ox + 44, oy + headDY + 23, 3.5, 2.2, C.pink);
      ctx.globalAlpha = 1;
    }
  }

  /** 走路：身体拉长一点，腿交替，尾巴翘起来 */
  function drawWalking(ctx, ox, oy, opts) {
    const phase = Math.floor(opts.time * 7) % 2;
    const bob = phase ? 0 : 1;

    /* 尾巴翘起，带虎斑环 */
    const sway = Math.sin(opts.time * 4) * 3;
    const wp0 = { x: ox + 45, y: oy + 42 };
    const wp1 = { x: ox + 58 + sway, y: oy + 32 };
    const wp2 = { x: ox + 55 + sway, y: oy + 14 };
    D.bezierTail(ctx, wp0, wp1, wp2, 6, C.furMid);
    for (let i = 1; i <= 3; i++) {
      const p = D.quadPoint(0.34 + i * 0.18, wp0, wp1, wp2);
      D.rect(ctx, p.x - 3, p.y - 2, 6, 3, C.furDark);
    }
    D.ellipse(ctx, wp2.x, wp2.y - 2, 3, 3, C.cream);

    /* 腿：正面看是两条前腿交替抬起，爪尖是白的 */
    const lLift = phase ? 3 : 0;
    const rLift = phase ? 0 : 3;
    D.rect(ctx, ox + 19, oy + 46 - lLift, 7, 11, C.fur);
    D.rect(ctx, ox + 38, oy + 46 - rLift, 7, 11, C.fur);
    D.rect(ctx, ox + 19, oy + 53 - lLift, 7, 4, C.cream);
    D.rect(ctx, ox + 38, oy + 53 - rLift, 7, 4, C.cream);

    /* 身体（横向拉长、上下颠） */
    D.ellipse(ctx, ox + 32, oy + 39 + bob, 19, 12, C.fur);
    D.ellipse(ctx, ox + 32, oy + 40 + bob, 10, 9, C.cream);
    D.rect(ctx, ox + 13, oy + 34 + bob, 7, 2, C.furDark);
    D.rect(ctx, ox + 44, oy + 34 + bob, 7, 2, C.furDark);
    D.rect(ctx, ox + 12, oy + 40 + bob, 6, 2, C.furDark);
    D.rect(ctx, ox + 46, oy + 40 + bob, 6, 2, C.furDark);

    drawHead(ctx, ox, oy, opts, bob);
  }

  /** 睡着：整只猫蜷成一团，头枕在自己爪子上，尾巴绕到前面 */
  function drawSleeping(ctx, ox, oy, opts) {
    const breathe = Math.sin(opts.time * 1.2) * 0.9;

    /* 尾巴从身后绕到身前，垫在下巴下面 */
    D.bezierTail(ctx, ox + 46, oy + 52, ox + 60, oy + 58, ox + 30, oy + 58, 6, C.furMid);
    D.ellipse(ctx, ox + 28, oy + 57, 3, 3, C.cream);

    /* 身体：一大团压在地上，随呼吸起伏 */
    D.ellipse(ctx, ox + 36, oy + 50, 24, 11 + breathe, C.fur);
    D.ellipse(ctx, ox + 38, oy + 52, 16, 7 + breathe, C.cream);
    /* 背上的虎斑 */
    D.rect(ctx, ox + 32, oy + 41, 8, 2, C.furDark);
    D.rect(ctx, ox + 43, oy + 42, 7, 2, C.furDark);
    D.rect(ctx, ox + 50, oy + 47, 6, 2, C.furDark);

    /* 头：缩在左边，比坐着的时候小一圈，才像蜷起来的猫 */
    D.ellipse(ctx, ox + 18, oy + 44, 12, 9.5, C.fur);
    D.ellipse(ctx, ox + 18, oy + 48, 8, 4.5, C.cream);
    /* 耳朵向前倒 */
    D.triangle(ctx, ox + 10, oy + 33, ox + 6, oy + 44, ox + 18, oy + 38, C.furMid);
    D.triangle(ctx, ox + 26, oy + 33, ox + 31, oy + 42, ox + 20, oy + 38, C.furMid);
    D.triangle(ctx, ox + 10, oy + 37, ox + 9, oy + 42, ox + 16, oy + 39, C.pink);
    /* 额头 M 纹（歪着） */
    D.rect(ctx, ox + 17, oy + 36, 1, 3, C.furDark);
    D.rect(ctx, ox + 13, oy + 37, 1, 2, C.furDark);
    D.rect(ctx, ox + 21, oy + 37, 1, 2, C.furDark);

    /* 闭着的眼睛 */
    D.rect(ctx, ox + 11, oy + 44, 5, 1, C.eye);
    D.rect(ctx, ox + 20, oy + 44, 5, 1, C.eye);
    /* 鼻子 */
    D.rect(ctx, ox + 17, oy + 48, 3, 1, C.pinkDeep);
  }

  /** 被提起来：四脚离地，眼睛瞪大，尾巴垂下 */
  function drawHeld(ctx, ox, oy, opts) {
    const swing = Math.sin(opts.time * 6) * 3;

    /* 尾巴往下 */
    D.bezierTail(ctx, ox + 46, oy + 42, ox + 58, oy + 52, ox + 54 + swing, oy + 60, 6, C.furMid);
    for (let i = 1; i <= 2; i++) {
      D.rect(ctx, ox + 50 + i * 2, oy + 48 + i * 4, 6, 3, C.furDark);
    }

    /* 身体被拉长 */
    D.ellipse(ctx, ox + 32, oy + 42, 16, 15, C.fur);
    D.ellipse(ctx, ox + 32, oy + 44, 9, 10, C.cream);

    /* 四条腿往下垂：外两条长、内两条短，末端是浅色脚掌 */
    D.rect(ctx, ox + 18, oy + 52, 6, 8, C.fur);
    D.rect(ctx, ox + 26, oy + 54, 5, 7, C.fur);
    D.rect(ctx, ox + 34, oy + 54, 5, 7, C.fur);
    D.rect(ctx, ox + 41, oy + 52, 6, 8, C.fur);
    D.ellipse(ctx, ox + 21, oy + 59, 3.2, 2.2, C.cream);
    D.ellipse(ctx, ox + 28.5, oy + 60, 3, 2, C.cream);
    D.ellipse(ctx, ox + 36.5, oy + 60, 3, 2, C.cream);
    D.ellipse(ctx, ox + 44, oy + 59, 3.2, 2.2, C.cream);

    /* 头 */
    const opt2 = {
      time: opts.time,
      look: opts.look,
      eyeMode: 'wide',
      mouthOpen: 1,
      blush: false,
      headDY: 0
    };
    drawHead(ctx, ox, oy, opt2, 0);
  }

  /* ==========================================================
     Cat
     ========================================================== */

  class Cat {
    constructor() {
      this.x = 160;
      this.y = GROUND;
      this.vx = 0;
      this.vy = 0;
      this.onGround = true;

      this.state = 'idle';
      this.stateTime = 0;
      this.stateDuration = Infinity;

      this.facing = 1;
      this.lookX = 0;
      this.lookY = 0;
      this.lookTargetX = 0;
      this.lookTargetY = 0;

      this.blinkTimer = 2 + Math.random() * 3;
      this.blinking = 0;
      this.mouthOpen = 0;

      this.dragging = false;
      this.dragDX = 0;
      this.dragDY = 0;

      this.thinkTimer = 1.5 + Math.random() * 2;
      this.targetX = null;
      this.affection = 0;
      this.fullness = 60;

      this.happyTimer = 0;
      this.heartTimer = 0;
    }

    /* ---------------- 状态控制 ---------------- */

    setState(name, duration) {
      if (this.state === name) {
        this.stateTime = 0;
        return;
      }
      this.state = name;
      this.stateTime = 0;
      this.stateDuration = duration === undefined ? Infinity : duration;
      if (name === 'walk' && this.targetX === null) {
        this.targetX = clamp(this.x + (Math.random() - 0.5) * 90, MIN_X, MAX_X);
      }
      if (name !== 'walk') this.targetX = null;
    }

    /** 被抚摸：进入开心状态，飘爱心 */
    pet() {
      this.setState('happy', 1.1);
      this.happyTimer = 1.1;
      this.heartTimer = 1.1;
      this.affection = clamp(this.affection + 3, 0, 100);
      return this.affection;
    }

    /** 吃东西 */
    eat() {
      this.setState('eat', 1.6);
      this.fullness = clamp(this.fullness + 18, 0, 100);
    }

    /** 抓起 */
    grab(mx, my) {
      this.dragging = true;
      this.setState('held');
      this.dragDX = this.x - mx;
      this.dragDY = this.y - my;
      this.vx = 0;
      this.vy = 0;
    }

    /** 松手，交给重力 */
    release() {
      this.dragging = false;
      this.setState('fall');
      this.vy = 30;
    }

    /* ---------------- 更新 ---------------- */

    update(dt, world) {
      this.stateTime += dt;

      /* 视线平滑跟随 */
      this.lookX += (this.lookTargetX - this.lookX) * Math.min(1, dt * 9);
      this.lookY += (this.lookTargetY - this.lookY) * Math.min(1, dt * 9);

      /* 眨眼 */
      this.blinkTimer -= dt;
      if (this.blinking > 0) {
        this.blinking -= dt;
        if (this.blinking <= 0) this.blinkTimer = 2.4 + Math.random() * 3.6;
      } else if (this.blinkTimer <= 0 && this.state !== 'sleep') {
        this.blinking = 0.12;
      }

      /* 被抓住时完全跟随鼠标 */
      if (this.dragging) {
        this.x = clamp(world.mouseX + this.dragDX, 8, PET.VIEW_W - 8);
        this.y = clamp(world.mouseY + this.dragDY, 30, PET.VIEW_H - 6);
        this.vy = 0;
        return;
      }

      /* 重力 */
      this.vy += 760 * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND) {
        if (!this.onGround && this.vy > 260) {
          /* 落地：弹一下 */
          this.setState('happy', 0.5);
          this.heartTimer = 0;
        }
        this.y = GROUND;
        this.vy = 0;
        this.onGround = true;
        if (this.state === 'fall') this.setState('idle');
      } else {
        this.onGround = false;
      }

      /* 走动 */
      if (this.state === 'walk' && this.targetX !== null) {
        const dx = this.targetX - this.x;
        const speed = 30;
        if (Math.abs(dx) < 2) {
          this.setState('idle');
          this.thinkTimer = 1.2 + Math.random() * 2.4;
        } else {
          this.facing = dx > 0 ? 1 : -1;
          this.x += this.facing * speed * dt;
        }
      }

      /* 状态超时回落 */
      if (this.stateDuration !== Infinity && this.stateTime >= this.stateDuration) {
        this.setState(this.onGround ? 'idle' : 'fall');
        this.thinkTimer = 0.8 + Math.random() * 2;
      }

      /* 嘴巴开合（吃东西时） */
      if (this.state === 'eat') {
        this.mouthOpen = Math.sin(this.stateTime * 14) > 0 ? 1 : 0;
      } else {
        this.mouthOpen = 0;
      }

      /* 开心倒计时 */
      if (this.happyTimer > 0) this.happyTimer = Math.max(0, this.happyTimer - dt);
      if (this.heartTimer > 0) this.heartTimer = Math.max(0, this.heartTimer - dt);

      /* 自主行为 */
      this.thinkTimer -= dt;
      if (this.thinkTimer <= 0) this.think(world);
    }

    /** 自主决策：睡觉、散步、发呆、靠近鼠标 */
    think(world) {
      if (this.dragging) return;
      if (this.state === 'walk' || this.state === 'eat' || this.state === 'held') return;

      const sleepy = world.sleepiness || 0;
      const r = Math.random();

      /* 越困越容易睡 */
      if (this.state !== 'sleep' && r < 0.1 + sleepy * 0.45) {
        this.setState('sleep', 6 + Math.random() * 10);
        this.thinkTimer = Infinity;
        return;
      }

      /* 睡饱了醒来 */
      if (this.state === 'sleep') {
        this.setState('idle');
        this.thinkTimer = 0.6 + Math.random() * 1.4;
        return;
      }

      /* 亲密度高 + 鼠标在动：主动凑过去 */
      if (world.mouseActive && this.affection > 40 && r < 0.55) {
        this.targetX = clamp(world.mouseX + (Math.random() - 0.5) * 20, MIN_X, MAX_X);
        this.setState('walk');
        this.thinkTimer = 3 + Math.random() * 2;
        return;
      }

      if (r < 0.45) {
        this.targetX = clamp(this.x + (Math.random() - 0.5) * 120, MIN_X, MAX_X);
        this.setState('walk');
        this.thinkTimer = 4 + Math.random() * 3;
      } else {
        this.setState('idle');
        this.thinkTimer = 1.6 + Math.random() * 3.2;
      }
    }

    /** 被点了一下：如果在睡觉就醒来 */
    wake() {
      if (this.state === 'sleep') {
        this.setState('idle');
        this.thinkTimer = 1;
        return true;
      }
      return false;
    }

    /* ---------------- 绘制 ---------------- */

    get spriteTop() {
      return this.y - FOOT_OFFSET;
    }

    /** 精灵的包围盒（用于命中测试） */
    bounds() {
      const top = this.spriteTop;
      return { x: this.x - 30, y: top + 4, w: 60, h: 55 };
    }

    draw(ctx, time) {
      const ox = Math.round(this.x) - SPRITE_W / 2;
      let oy = Math.round(this.spriteTop);

      /* 开心时整只猫往上蹦 */
      if (this.state === 'happy') {
        const k = Math.max(0, 1 - this.stateTime / 0.55);
        oy -= Math.round(Math.sin(k * Math.PI) * 8);
      }

      const eyeMode = this.state === 'sleep'
        ? 'closed'
        : this.state === 'happy'
          ? 'happy'
          : this.blinking > 0
            ? 'closed'
            : 'normal';

      const opts = {
        time: time,
        look: { x: this.lookX, y: this.lookY },
        eyeMode: eyeMode,
        mouthOpen: this.mouthOpen,
        blush: this.state === 'happy',
        headDY: 0
      };

      ctx.save();
      switch (this.state) {
        case 'sleep':
          drawSleeping(ctx, ox, oy - 3, opts);
          break;
        case 'walk':
          drawWalking(ctx, ox, oy, opts);
          break;
        case 'held':
          drawHeld(ctx, ox, oy, opts);
          break;
        case 'eat':
          opts.headDY = 4;
          drawSitting(ctx, ox, oy, opts);
          break;
        default:
          drawSitting(ctx, ox, oy, opts);
      }
      ctx.restore();
    }

    /** 开心的爱心特效，画在场景坐标上 */
    drawEffects(ctx, time) {
      if (this.heartTimer > 0) {
        const life = 1 - this.heartTimer / 1.1;
        for (let i = 0; i < 3; i++) {
          const phase = life - i * 0.18;
          if (phase < 0) continue;
          const alpha = Math.max(0, 1 - phase * 1.3);
          const rise = phase * 24;
          const hx = Math.round(this.x - 16 + i * 14 + Math.sin(phase * 5 + i) * 3);
          const hy = Math.round(this.spriteTop - 12 - rise);
          ctx.globalAlpha = alpha;
          drawHeart(ctx, hx, hy, C.heart);
          ctx.globalAlpha = 1;
        }
      }

      /* 睡着时冒 zZ */
      if (this.state === 'sleep') {
        for (let i = 0; i < 3; i++) {
          const phase = (time * 0.55 + i * 0.34) % 1;
          const alpha = Math.sin(phase * Math.PI) * 0.85;
          const zx = Math.round(this.x + 12 + phase * 12);
          const zy = Math.round(this.spriteTop + 6 - phase * 22);
          ctx.globalAlpha = alpha;
          /* 一个 4x4 的像素字母 Z */
          D.rect(ctx, zx, zy, 4, 1, C.zzz);
          D.rect(ctx, zx + 1, zy + 1, 2, 1, C.zzz);
          D.rect(ctx, zx, zy + 2, 1, 1, C.zzz);
          D.rect(ctx, zx, zy + 3, 4, 1, C.zzz);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  PET.Cat = Cat;
  PET.CAT_METRICS = { SPRITE_W, SPRITE_H, FOOT_OFFSET, MIN_X, MAX_X };
})(window);
