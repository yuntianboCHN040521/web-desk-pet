/*!
 * web-desk-pet · 像素绘制工具与调色板
 *
 * 坐标系约定：所有绘制都发生在「逻辑像素」坐标系里（默认 320 x 180）。
 * 放大交给 CSS 的 image-rendering: pixelated，这里只负责画对每一颗像素。
 */
(function (global) {
  'use strict';

  const PET = (global.PET = global.PET || {});

  /* ==========================================================
     调色板 —— 整个项目的颜色只在这里定义
     ========================================================== */
  PET.COLORS = {
    /* 猫 */
    fur:       '#f2a65a',
    furMid:    '#e28c3e',
    furDark:   '#bc6f30',
    furLight:  '#ffcb90',
    cream:     '#fbe9d0',
    creamDeep: '#e8d0b2',
    pink:      '#e88fa2',
    pinkDeep:  '#c26f80',
    eye:       '#241a16',
    eyeGlow:   '#ffffff',
    whisker:   'rgba(255, 233, 208, 0.72)',

    /* 房间 */
    wallTop:    '#0a0f1e',
    wallBottom: '#18213b',
    skirting:   '#0d1424',
    floor:      '#2a1d15',
    floorDark:  '#1c130d',
    floorLine:  '#3d2a1d',

    /* 窗与月光 */
    frame:     '#3a4360',
    frameLit:  '#4f5a82',
    glass:     '#243058',
    glassGlow: '#3a4d80',
    moon:      '#f6efd6',
    star:      '#dfe6ff',

    /* 道具 */
    cushion:   '#6f3b41',
    cushionHi: '#8a4c52',
    cushionLo: '#4a2529',
    fish:      '#9fb6d8',
    fishDark:  '#6d85a8',
    fishBelly: '#d3e0f2',

    /* 特效 */
    dust:     'rgba(148, 172, 220, 0.55)',
    moonbeam: 'rgba(160, 190, 240, 0.06)',
    zzz:      '#aab8dd',
    heart:    '#ff8098',
    spark:    '#ffe9a8'
  };

  /* ==========================================================
     基础绘制原语
     ========================================================== */

  /** 实心矩形（坐标取整，保证像素对齐） */
  function rect(ctx, x, y, w, h, color) {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** 单颗像素 */
  function pixel(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  /**
   * 像素化椭圆：用「扫描行」填充，每行只调一次 fillRect。
   * 这样既保证边缘是硬像素，又不会因为逐像素调用而掉帧。
   */
  function ellipse(ctx, cx, cy, rx, ry, color) {
    if (rx <= 0 || ry <= 0) return;
    ctx.fillStyle = color;
    const yTop = Math.round(cy - ry);
    const yBot = Math.round(cy + ry);
    for (let y = yTop; y <= yBot; y++) {
      const dy = (y + 0.5 - cy) / ry;
      const k = 1 - dy * dy;
      if (k <= 0) continue;
      const half = rx * Math.sqrt(k);
      const x0 = Math.round(cx - half);
      const x1 = Math.round(cx + half);
      const w = Math.max(1, x1 - x0);
      ctx.fillRect(x0, y, w, 1);
    }
  }

  /** 像素化三角形（同样按扫描行填充） */
  function triangle(ctx, ax, ay, bx, by, cx, cy, color) {
    ctx.fillStyle = color;
    const pts = [[ax, ay], [bx, by], [cx, cy]];
    const yTop = Math.round(Math.min(ay, by, cy));
    const yBot = Math.round(Math.max(ay, by, cy));
    for (let y = yTop; y <= yBot; y++) {
      const xs = [];
      for (let i = 0; i < 3; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % 3];
        if ((y1 <= y && y2 >= y) || (y2 <= y && y1 >= y)) {
          if (y1 === y2) {
            xs.push(x1, x2);
          } else {
            xs.push(x1 + ((x2 - x1) * (y - y1)) / (y2 - y1));
          }
        }
      }
      if (xs.length >= 2) {
        const x0 = Math.round(Math.min.apply(null, xs));
        const x1 = Math.round(Math.max.apply(null, xs));
        ctx.fillRect(x0, y, Math.max(1, x1 - x0), 1);
      }
    }
  }

  /**
   * 粗线段：用来画尾巴、胡须这类有粗细的曲线。
   * 沿线段等距采样，每个采样点盖一个 size×size 的方块。
   */
  function thickLine(ctx, x0, y0, x1, y1, size, color) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    ctx.fillStyle = color;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), Math.round(size), Math.round(size));
    }
  }

  /** 二次贝塞尔采样点：尾巴的弯曲就是用它算出来的 */
  function quadPoint(t, p0, p1, p2) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
    };
  }

  /** 沿二次贝塞尔曲线画一条粗尾巴 */
  function bezierTail(ctx, p0, p1, p2, size, color) {
    const steps = 18;
    let prev = p0;
    for (let i = 1; i <= steps; i++) {
      const cur = quadPoint(i / steps, p0, p1, p2);
      thickLine(ctx, prev.x, prev.y, cur.x, cur.y, size, color);
      prev = cur;
    }
  }

  /** 线性插值 */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** 夹取 */
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  PET.draw = {
    rect: rect,
    pixel: pixel,
    ellipse: ellipse,
    triangle: triangle,
    thickLine: thickLine,
    bezierTail: bezierTail,
    quadPoint: quadPoint
  };
  PET.math = { lerp: lerp, clamp: clamp };

  /* 场景共用的地面高度：猫的脚底踩在这条线上 */
  PET.GROUND_Y = 154;
  PET.VIEW_W = 320;
  PET.VIEW_H = 180;
})(window);
