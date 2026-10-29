/*!
 * web-desk-pet · 夜间房间场景
 *
 * 静态部分（墙、地板、窗、挂画、坐垫）只在启动时绘制一次到离屏 canvas；
 * 每帧只叠加会动的东西（星星闪烁、飘浮的灰尘、月光束），保证流畅。
 */
(function (global) {
  'use strict';

  const PET = global.PET;
  const D = PET.draw;
  const C = PET.COLORS;
  const W = PET.VIEW_W;
  const H = PET.VIEW_H;

  /** 窗户在场景里的位置 */
  const WINDOW = { x: 206, y: 16, w: 80, h: 76 };
  /** 墙与地板的交界线 */
  const FLOOR_LINE = 126;

  /* 飘浮的灰尘：位置、速度、大小、亮度 */
  const dust = [];
  for (let i = 0; i < 24; i++) {
    dust.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 2.4,
      vy: -1.6 - Math.random() * 2.6,
      size: Math.random() < 0.72 ? 1 : 2,
      alpha: 0.18 + Math.random() * 0.42
    });
  }

  /* 星星：窗外的几点光 */
  const stars = [];
  for (let i = 0; i < 9; i++) {
    stars.push({
      x: WINDOW.x + 5 + Math.random() * (WINDOW.w - 10),
      y: WINDOW.y + 4 + Math.random() * (WINDOW.h * 0.55),
      phase: Math.random() * Math.PI * 2,
      speed: 0.7 + Math.random() * 1.6
    });
  }

  /** 两个 hex 颜色按比例混合，用于画出分段色带 */
  function mix(a, b, t) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /** 画墙：用 8 行一档的色带，保留像素画的层次感 */
  function paintWall(g) {
    const bands = 10;
    const bandH = FLOOR_LINE / bands;
    for (let i = 0; i < bands; i++) {
      D.rect(g, 0, i * bandH, W, bandH + 1, mix(C.wallTop, C.wallBottom, i / (bands - 1)));
    }
  }

  /** 画地板：深色木地板 + 板缝 + 一点月光反光 */
  function paintFloor(g) {
    D.rect(g, 0, FLOOR_LINE, W, H - FLOOR_LINE, C.floor);
    /* 踢脚线 */
    D.rect(g, 0, FLOOR_LINE, W, 5, C.skirting);
    D.rect(g, 0, FLOOR_LINE + 5, W, 1, C.floorLine);
    /* 板缝：越靠近观众间距越大，制造一点纵深感 */
    let y = FLOOR_LINE + 14;
    let gap = 9;
    while (y < H) {
      D.rect(g, 0, y, W, 1, C.floorDark);
      y += gap;
      gap += 2;
    }
    /* 月光落在地板上的一块亮斑 */
    g.save();
    g.globalAlpha = 0.055;
    D.triangle(g, WINDOW.x - 10, FLOOR_LINE + 6, WINDOW.x + WINDOW.w - 4, FLOOR_LINE + 6, WINDOW.x + 8, H, C.moon);
    D.triangle(g, WINDOW.x + WINDOW.w - 4, FLOOR_LINE + 6, WINDOW.x + 8, H, WINDOW.x + WINDOW.w - 22, H, C.moon);
    g.restore();
  }

  /** 画窗户：外框、玻璃、月亮、月晕、窗棂 */
  function paintWindow(g) {
    const { x, y, w, h } = WINDOW;

    /* 窗外的夜空（比室内更亮一点的蓝） */
    D.rect(g, x, y, w, h, C.glass);
    for (let i = 0; i < 6; i++) {
      D.rect(g, x, y + i * (h / 6), w, h / 6 + 1, mix(C.glassGlow, C.glass, i / 5));
    }

    /* 月亮 */
    const mx = x + w - 24;
    const my = y + 22;
    g.save();
    g.globalAlpha = 0.16;
    D.ellipse(g, mx, my, 15, 15, C.moon);
    g.globalAlpha = 0.3;
    D.ellipse(g, mx, my, 11, 11, C.moon);
    g.restore();
    D.ellipse(g, mx, my, 7, 7, C.moon);
    /* 月亮的暗面 */
    D.ellipse(g, mx + 3, my - 2, 5, 5, mix(C.moon, C.glass, 0.22));

    /* 窗框 */
    g.save();
    g.globalAlpha = 1;
    /* 左右竖框 */
    D.rect(g, x - 3, y - 3, 3, h + 6, C.frame);
    D.rect(g, x + w, y - 3, 3, h + 6, C.frame);
    /* 上下横框 */
    D.rect(g, x - 3, y - 3, w + 6, 3, C.frame);
    D.rect(g, x - 3, y + h, w + 6, 3, C.frame);
    /* 窗棂：一竖一横 */
    D.rect(g, x + w / 2 - 1, y, 2, h, C.frame);
    D.rect(g, x, y + h / 2 - 1, w, 2, C.frame);
    /* 窗框受光的一侧 */
    D.rect(g, x - 3, y - 3, w + 6, 1, C.frameLit);
    D.rect(g, x - 3, y - 3, 1, h + 6, C.frameLit);
    g.restore();

    /* 窗台 */
    D.rect(g, x - 6, y + h + 3, w + 12, 4, C.frame);
    D.rect(g, x - 6, y + h + 3, w + 12, 1, C.frameLit);
  }

  /** 画墙上的小挂画：一只鱼的剪影 */
  function paintPicture(g) {
    const x = 46;
    const y = 40;
    const w = 34;
    const h = 26;
    /* 外框 */
    D.rect(g, x, y, w, h, C.frame);
    D.rect(g, x + 2, y + 2, w - 4, h - 4, C.floorDark);
    D.rect(g, x, y, w, 1, C.frameLit);
    /* 画里的一条小鱼 */
    const cx = x + w / 2;
    const cy = y + h / 2 + 1;
    D.ellipse(g, cx - 1, cy, 7, 4, C.fishDark);
    D.triangle(g, cx + 5, cy, cx + 11, cy - 5, cx + 11, cy + 5, C.fishDark);
    D.pixel(g, cx - 4, cy - 1, C.fishBelly);
    /* 悬挂的线 */
    D.rect(g, cx, y - 6, 1, 6, C.skirting);
    D.pixel(g, cx, y - 7, C.frameLit);
  }

  /** 画猫的坐垫：一块有厚度的圆垫，压得比地板暗一点，不抢猫的戏 */
  function paintCushion(g) {
    const cx = 104;
    const cy = 157;

    /* 地板上的影子 */
    D.ellipse(g, cx, cy + 5, 29, 8, 'rgba(0, 0, 0, 0.34)');
    /* 厚度 */
    D.ellipse(g, cx, cy + 2, 27, 8, C.cushionLo);
    /* 顶面 */
    D.ellipse(g, cx, cy, 27, 8, C.cushion);
    /* 被猫压出来的浅凹 */
    D.ellipse(g, cx + 1, cy + 1, 16, 4.5, C.cushionLo);
    D.ellipse(g, cx - 3, cy - 2, 10, 2.5, C.cushionHi);
  }

  /* 静态背景画布 */
  let background = null;

  function build() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    paintWall(g);
    paintFloor(g);
    paintWindow(g);
    paintPicture(g);
    paintCushion(g);
    background = c;
    return background;
  }

  /**
   * 每帧绘制场景。
   * @param {CanvasRenderingContext2D} ctx 主画布上下文
   * @param {number} time 累计秒数
   * @param {number} sleepiness 0~1，越困月光越冷、灰尘越慢
   */
  function draw(ctx, time, sleepiness) {
    if (!background) build();
    ctx.drawImage(background, 0, 0);

    /* 星星闪烁：画在窗玻璃之上，所以重新盖一遍窗内区域再画 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
    ctx.clip();
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(time * s.speed + s.phase));
      ctx.globalAlpha = tw * 0.9;
      D.rect(ctx, s.x, s.y, 1, 1, C.star);
      if (tw > 0.86) {
        D.rect(ctx, s.x - 1, s.y, 3, 1, C.star);
        D.rect(ctx, s.x, s.y - 1, 1, 3, C.star);
      }
    }
    ctx.restore();

    /* 从窗口射进来的月光束 */
    ctx.save();
    ctx.globalAlpha = 1;
    D.triangle(ctx, WINDOW.x + 2, WINDOW.y + WINDOW.h, WINDOW.x + WINDOW.w - 2, WINDOW.y + WINDOW.h,
      WINDOW.x - 26, FLOOR_LINE + 4, C.moonbeam);
    D.triangle(ctx, WINDOW.x + WINDOW.w - 2, WINDOW.y + WINDOW.h, WINDOW.x + WINDOW.w + 14, FLOOR_LINE + 4,
      WINDOW.x - 26, FLOOR_LINE + 4, C.moonbeam);
    ctx.restore();

    /* 飘浮的灰尘 */
    const slow = 1 - sleepiness * 0.55;
    for (let i = 0; i < dust.length; i++) {
      const p = dust[i];
      const x = p.x + Math.sin(time * 0.7 + i) * 4;
      const y = p.y;
      ctx.globalAlpha = p.alpha * (0.65 + 0.35 * Math.sin(time * 1.3 + i * 1.7));
      D.rect(ctx, ((x % W) + W) % W, ((y % H) + H) % H, p.size, p.size, C.dust);
      p.x += p.vx * 0.06 * slow;
      p.y += p.vy * 0.06 * slow;
      if (p.y < -4) {
        p.y = H + 2;
        p.x = Math.random() * W;
      }
    }
    ctx.globalAlpha = 1;
  }

  PET.Scene = {
    build: build,
    draw: draw,
    WINDOW: WINDOW,
    FLOOR_LINE: FLOOR_LINE
  };
})(window);
