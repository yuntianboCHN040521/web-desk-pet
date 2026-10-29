/*!
 * web-desk-pet · 像素猫
 *
 * 一只用代码逐像素画出来的狸花猫：棕灰虎斑、白口鼻白胸白爪、绿眼睛。
 * 没有图片资源，所有形状都是几何原语叠出来的，
 * 所以任何分辨率下都不会糊，也不存在二创版权问题。
 *
 * 精灵画布 48 x 46 逻辑像素，脚底在 y=44。
 */
(function (global) {
  'use strict';

  const PET = global.PET;
  const D = PET.draw;
  const C = PET.COLORS;
  const GROUND = PET.GROUND_Y;
  const clamp = PET.math.clamp;

  const SPRITE_W = 48;
  const SPRITE_H = 46;
  const FOOT_OFFSET = 44; /* 脚底相对精灵顶部的偏移 */
  const MIN_X = 34;
  const MAX_X = 286;

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
   * look.x / look.y 是 -1..1 的视线方向。
   * 按真猫做：绿色虹膜 + 黑色竖瞳 + 一点高光。
   */
  function drawEye(ctx, ex, ey, look, mode) {
    if (mode === 'closed') {
      D.rect(ctx, ex - 2, ey, 5, 1, C.eye);
      return;
    }
    if (mode === 'happy') {
      /* ^ ^ 形状：一条横线 + 两端上翘 */
      D.rect(ctx, ex - 1, ey + 1, 4, 1, C.eye);
      D.pixel(ctx, ex - 2, ey, C.eye);
      D.pixel(ctx, ex + 2, ey, C.eye);
      return;
    }
    if (mode === 'wide') {
      D.ellipse(ctx, ex, ey, 3.2, 3.8, C.eyeIris);
      D.rect(ctx, ex - 0.5, ey - 1.5, 1.5, 3, C.eye);
      D.rect(ctx, ex - 1.5, ey - 2, 1.5, 1.5, C.eyeGlow);
      return;
    }
    const x = ex + Math.round(look.x * 1.4);
    const y = ey + Math.round(look.y * 1.0);
    D.ellipse(ctx, x, y, 2.8, 3.2, C.eyeIris);
    D.rect(ctx, x - 0.5, y - 1.5, 1.5, 3, C.eye);
    D.rect(ctx, x - 1.5, y - 2, 1.5, 1.5, C.eyeGlow);
  }

  /** 一对耳朵（正面视角），inneres 画粉色耳内 */
  function drawEars(ctx, ox, oy) {
    /* 左耳 */
    D.triangle(ctx, ox + 13, oy + 3, ox + 8, oy + 14, ox + 20, oy + 10, C.furMid);
    D.triangle(ctx, ox + 13, oy + 6, ox + 10, oy + 12, ox + 17, oy + 10, C.pink);
    /* 右耳 */
    D.triangle(ctx, ox + 35, oy + 3, ox + 40, oy + 14, ox + 28, oy + 10, C.furMid);
    D.triangle(ctx, ox + 35, oy + 6, ox + 38, oy + 12, ox + 31, oy + 10, C.pink);
  }

  /** 额头的虎斑 M 纹，狸花猫的标志 */
  function drawHeadStripes(ctx, ox, oy) {
    /* 中间一竖最长 */
    D.rect(ctx, ox + 24, oy + 3, 1, 4, C.furDark);
    /* 两侧各一竖，稍短 */
    D.rect(ctx, ox + 20, oy + 4, 1, 3, C.furDark);
    D.rect(ctx, ox + 28, oy + 4, 1, 3, C.furDark);
    /* 下面两笔往中间收，凑出个 M */
    D.rect(ctx, ox + 22, oy + 7, 1, 2, C.furDark);
    D.rect(ctx, ox + 26, oy + 7, 1, 2, C.furDark);
  }

  /** 鼻子 + 嘴 + 胡须 */
  function drawFace(ctx, ox, oy, mouthOpen) {
    /* 鼻子 */
    D.rect(ctx, ox + 23, oy + 18, 3, 1, C.pinkDeep);
    D.pixel(ctx, ox + 23, oy + 19, C.pinkDeep);
    D.pixel(ctx, ox + 25, oy + 19, C.pinkDeep);
    /* 嘴：两条向下撇的短线，张嘴时中间裂开 */
    if (mouthOpen > 0) {
      D.rect(ctx, ox + 24, oy + 20, 1, 2, C.pinkDeep);
      D.rect(ctx, ox + 23, oy + 21, 4, 1, C.pinkDeep);
    } else {
      D.pixel(ctx, ox + 23, oy + 20, C.furDark);
      D.pixel(ctx, ox + 25, oy + 20, C.furDark);
      D.pixel(ctx, ox + 22, oy + 21, C.furDark);
      D.pixel(ctx, ox + 26, oy + 21, C.furDark);
    }
    /* 胡须：左右各两根 */
    ctx.fillStyle = C.whisker;
    D.thickLine(ctx, ox + 20, oy + 19, ox + 9, oy + 17, 1, C.whisker);
    D.thickLine(ctx, ox + 20, oy + 20, ox + 10, oy + 21, 1, C.whisker);
    D.thickLine(ctx, ox + 28, oy + 19, ox + 39, oy + 17, 1, C.whisker);
    D.thickLine(ctx, ox + 28, oy + 20, ox + 38, oy + 21, 1, C.whisker);
  }

  /* ==========================================================
     各种姿态
     ========================================================== */

  /** 坐着：待机、被摸、吃东西都基于这个姿态 */
  function drawSitting(ctx, ox, oy, opts) {
    const t = opts.time;
    const breathe = Math.sin(t * 2.1) * 0.9;
    const headDY = opts.headDY || 0;

    /* 尾巴先画，压在身体下面；尾尖是白的，中段有几道虎斑环 */
    const sway = Math.sin(t * 1.6) * 3;
    const tp0 = { x: ox + 33, y: oy + 36 };
    const tp1 = { x: ox + 47 + sway, y: oy + 42 };
    const tp2 = { x: ox + 46 + sway * 0.5, y: oy + 24 };
    D.bezierTail(ctx, tp0, tp1, tp2, 4, C.furMid);
    for (let i = 1; i <= 2; i++) {
      const p = D.quadPoint(0.46 + i * 0.18, tp0, tp1, tp2);
      D.rect(ctx, p.x - 2, p.y - 2, 4, 2, C.furDark);
    }
    D.rect(ctx, ox + 45 + sway * 0.5, oy + 22, 2, 2, C.cream);

    /* 身体 */
    D.ellipse(ctx, ox + 24, oy + 33, 14, 11 + breathe, C.fur);
    /* 白色胸腹：从脖子一路铺到肚子，这是狸花猫最好认的地方 */
    D.ellipse(ctx, ox + 24, oy + 33, 6.5, 7.5 + breathe * 0.5, C.cream);
    /* 身体两侧的虎斑 */
    D.rect(ctx, ox + 10, oy + 29, 5, 1, C.furDark);
    D.rect(ctx, ox + 33, oy + 29, 5, 1, C.furDark);
    D.rect(ctx, ox + 10, oy + 34, 4, 1, C.furDark);
    D.rect(ctx, ox + 34, oy + 34, 4, 1, C.furDark);
    D.rect(ctx, ox + 12, oy + 38, 3, 1, C.furDark);
    D.rect(ctx, ox + 33, oy + 38, 3, 1, C.furDark);

    /* 前爪：先铺一层暗色当阴影再压上本体，才不会和肚子糊成一片 */
    D.ellipse(ctx, ox + 18, oy + 42, 4.6, 2.8, C.creamDeep);
    D.ellipse(ctx, ox + 30, oy + 42, 4.6, 2.8, C.creamDeep);
    D.ellipse(ctx, ox + 18, oy + 41.2, 4.2, 2.3, C.cream);
    D.ellipse(ctx, ox + 30, oy + 41.2, 4.2, 2.3, C.cream);
    /* 脚趾缝 */
    D.rect(ctx, ox + 17, oy + 42, 1, 1, C.creamDeep);
    D.rect(ctx, ox + 30, oy + 42, 1, 1, C.creamDeep);

    /* 头 */
    const hy = oy + 15 + headDY;
    D.ellipse(ctx, ox + 24, hy, 12, 10, C.fur);
    /* 白色口鼻：只盖鼻子到下巴那一块，做大了会把整张脸吃掉 */
    D.ellipse(ctx, ox + 24, hy + 6, 5, 3.5, C.cream);
    drawHeadStripes(ctx, ox, oy + headDY);
    drawEars(ctx, ox, oy + headDY);

    /* 眼睛 */
    const eyeY = hy + 0;
    drawEye(ctx, ox + 18, eyeY, opts.look, opts.eyeMode);
    drawEye(ctx, ox + 30, eyeY, opts.look, opts.eyeMode);

    drawFace(ctx, ox, oy + headDY, opts.mouthOpen);

    /* 腮红：被摸开心的时候才出现 */
    if (opts.blush) {
      ctx.globalAlpha = 0.5;
      D.ellipse(ctx, ox + 14, oy + headDY + 17, 2.4, 1.6, C.pink);
      D.ellipse(ctx, ox + 34, oy + headDY + 17, 2.4, 1.6, C.pink);
      ctx.globalAlpha = 1;
    }
  }

  /** 走路：身体拉长一点，腿交替，尾巴翘起来 */
  function drawWalking(ctx, ox, oy, opts) {
    const phase = Math.floor(opts.time * 7) % 2;
    const bob = phase ? 0 : 1;

    /* 尾巴翘起，带虎斑环 */
    const sway = Math.sin(opts.time * 4) * 2;
    const wp0 = { x: ox + 34, y: oy + 32 };
    const wp1 = { x: ox + 44 + sway, y: oy + 26 };
    const wp2 = { x: ox + 42 + sway, y: oy + 14 };
    D.bezierTail(ctx, wp0, wp1, wp2, 4, C.furMid);
    for (let i = 1; i <= 2; i++) {
      const p = D.quadPoint(0.42 + i * 0.2, wp0, wp1, wp2);
      D.rect(ctx, p.x - 2, p.y - 2, 4, 2, C.furDark);
    }
    D.rect(ctx, ox + 42 + sway, oy + 12, 2, 2, C.cream);

    /* 腿：正面看是两条前腿交替抬起，爪尖是白的 */
    const lLift = phase ? 2 : 0;
    const rLift = phase ? 0 : 2;
    D.rect(ctx, ox + 15, oy + 36 - lLift, 5, 8, C.fur);
    D.rect(ctx, ox + 28, oy + 36 - rLift, 5, 8, C.fur);
    D.rect(ctx, ox + 15, oy + 41 - lLift, 5, 3, C.cream);
    D.rect(ctx, ox + 28, oy + 41 - rLift, 5, 3, C.cream);

    /* 身体（横向拉长、上下颠） */
    D.ellipse(ctx, ox + 24, oy + 30 + bob, 15, 9, C.fur);
    D.ellipse(ctx, ox + 24, oy + 31 + bob, 8, 7, C.cream);
    D.rect(ctx, ox + 10, oy + 26 + bob, 5, 1, C.furDark);
    D.rect(ctx, ox + 33, oy + 26 + bob, 5, 1, C.furDark);
    D.rect(ctx, ox + 10, oy + 30 + bob, 4, 1, C.furDark);
    D.rect(ctx, ox + 34, oy + 30 + bob, 4, 1, C.furDark);

    /* 头 */
    const hy = oy + 14 + bob;
    D.ellipse(ctx, ox + 24, hy, 12, 10, C.fur);
    D.ellipse(ctx, ox + 24, hy + 6, 5, 3.5, C.cream);
    drawHeadStripes(ctx, ox, oy + bob);
    drawEars(ctx, ox, oy + bob);
    drawEye(ctx, ox + 18, hy, opts.look, opts.eyeMode);
    drawEye(ctx, ox + 30, hy, opts.look, opts.eyeMode);
    drawFace(ctx, ox, oy + bob, opts.mouthOpen);
  }

  /** 睡着：整只猫蜷成一团，头枕在自己爪子上，尾巴绕到前面 */
  function drawSleeping(ctx, ox, oy, opts) {
    const breathe = Math.sin(opts.time * 1.2) * 0.7;

    /* 尾巴从身后绕到身前，垫在下巴下面 */
    D.bezierTail(ctx,
      { x: ox + 34, y: oy + 40 },
      { x: ox + 46, y: oy + 46 },
      { x: ox + 24, y: oy + 46 },
      4, C.furMid);
    D.rect(ctx, ox + 22, oy + 45, 2, 2, C.cream);

    /* 身体：一大团压在地上，随呼吸起伏 */
    D.ellipse(ctx, ox + 27, oy + 38, 18, 8 + breathe, C.fur);
    D.ellipse(ctx, ox + 28, oy + 40, 12, 5 + breathe, C.cream);
    /* 背上的深色条纹 */
    D.rect(ctx, ox + 24, oy + 31, 6, 1, C.furDark);
    D.rect(ctx, ox + 32, oy + 32, 5, 1, C.furDark);

    /* 头：缩在左边，比坐着的时候小一圈，才像蜷起来的猫 */
    D.ellipse(ctx, ox + 14, oy + 34, 9, 7, C.fur);
    D.ellipse(ctx, ox + 14, oy + 37, 6, 3.5, C.cream);
    /* 耳朵向前倒 */
    D.triangle(ctx, ox + 8, oy + 26, ox + 5, oy + 34, ox + 14, oy + 30, C.furMid);
    D.triangle(ctx, ox + 19, oy + 26, ox + 23, oy + 33, ox + 15, oy + 30, C.furMid);
    D.triangle(ctx, ox + 8, oy + 29, ox + 7, oy + 33, ox + 12, oy + 31, C.pink);

    /* 闭着的眼睛 */
    D.rect(ctx, ox + 9, oy + 34, 4, 1, C.eye);
    D.rect(ctx, ox + 16, oy + 34, 4, 1, C.eye);
    /* 鼻子 */
    D.rect(ctx, ox + 13, oy + 37, 2, 1, C.pinkDeep);
  }

  /** 被提起来：四脚离地，眼睛瞪大，尾巴直直垂下 */
  function drawHeld(ctx, ox, oy, opts) {
    const swing = Math.sin(opts.time * 6) * 2;

    /* 尾巴往下 */
    D.bezierTail(ctx,
      { x: ox + 36, y: oy + 30 },
      { x: ox + 44, y: oy + 38 },
      { x: ox + 41 + swing, y: oy + 46 },
      4, C.furMid);

    /* 身体被拉长 */
    D.ellipse(ctx, ox + 24, oy + 30, 13, 12, C.fur);
    D.ellipse(ctx, ox + 24, oy + 33, 8, 8, C.cream);

    /* 四条腿往下垂：外两条长、内两条短，末端是浅色脚掌 */
    D.rect(ctx, ox + 13, oy + 38, 4, 6, C.fur);
    D.rect(ctx, ox + 19, oy + 39, 4, 5, C.fur);
    D.rect(ctx, ox + 26, oy + 39, 4, 5, C.fur);
    D.rect(ctx, ox + 32, oy + 38, 4, 6, C.fur);
    D.ellipse(ctx, ox + 15, oy + 44, 2.6, 1.8, C.cream);
    D.ellipse(ctx, ox + 21, oy + 44, 2.4, 1.6, C.cream);
    D.ellipse(ctx, ox + 28, oy + 44, 2.4, 1.6, C.cream);
    D.ellipse(ctx, ox + 34, oy + 44, 2.6, 1.8, C.cream);

    /* 头 */
    const hy = oy + 14;
    D.ellipse(ctx, ox + 24, hy, 12, 10, C.fur);
    D.ellipse(ctx, ox + 24, hy + 6, 5, 3.5, C.cream);
    drawHeadStripes(ctx, ox, oy);
    drawEars(ctx, ox, oy);
    drawEye(ctx, ox + 18, hy, opts.look, 'wide');
    drawEye(ctx, ox + 30, hy, opts.look, 'wide');
    /* 张开的小嘴 */
    D.rect(ctx, ox + 23, oy + 19, 3, 2, C.pinkDeep);
    D.rect(ctx, ox + 23, oy + 18, 3, 1, C.eye);
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
      return { x: this.x - 22, y: top + 3, w: 44, h: 42 };
    }

    draw(ctx, time) {
      /* 离地时在地面上留一团影子：跳起来才有重量感 */
      if (this.y < GROUND - 1) {
        const lift = Math.min(1, (GROUND - this.y) / 70);
        ctx.globalAlpha = 0.26 * (1 - lift * 0.65);
        D.ellipse(ctx, this.x, GROUND + 1, 17 - lift * 7, 4 - lift * 1.6, '#000000');
        ctx.globalAlpha = 1;
      }

      const ox = Math.round(this.x) - 24;
      let oy = Math.round(this.spriteTop);

      /* 开心时整只猫往上蹦 */
      if (this.state === 'happy') {
        const k = Math.max(0, 1 - this.stateTime / 0.55);
        oy -= Math.round(Math.sin(k * Math.PI) * 7);
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
          drawSleeping(ctx, ox, oy + 10, opts);
          break;
        case 'walk':
          drawWalking(ctx, ox, oy, opts);
          break;
        case 'held':
          drawHeld(ctx, ox, oy, opts);
          break;
        case 'eat':
          opts.headDY = 3;
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
          const rise = phase * 22;
          const hx = Math.round(this.x - 14 + i * 12 + Math.sin(phase * 5 + i) * 3);
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
          const zx = Math.round(this.x + 8 + phase * 10);
          const zy = Math.round(this.spriteTop + 6 - phase * 20);
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
