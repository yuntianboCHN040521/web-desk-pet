// ============================================================
//  DeskCat · 桌面像素猫
//
//  一个常驻桌面的像素猫：真透明分层窗口，猫身以外鼠标穿透，
//  不挡你干活；可拖动、可抚摸、可喂食，位置和状态会记住。
//
//  编译：csc /target:winexe /codepage:65001 /out:DeskCat.exe
//            /reference:System.Windows.Forms.dll
//            /reference:System.Drawing.dll DeskCat.cs
//
//  只用 .NET Framework 自带的东西，不需要装任何运行时依赖。
// ============================================================

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace DeskCat
{
    // ==================== 调色板 ====================
    static class Pal
    {
        static int C(int r, int g, int b)
        {
            return unchecked((int)0xFF000000) | (r << 16) | (g << 8) | b;
        }

        public static int WithAlpha(int color, int a)
        {
            return (color & 0x00FFFFFF) | (a << 24);
        }

        // 按用户家那只狸花猫配色：棕灰虎斑 + 白口鼻/白胸/白爪 + 绿眼睛
        public static readonly int Fur = C(0x8d, 0x76, 0x59);
        public static readonly int FurMid = C(0x73, 0x60, 0x4a);
        public static readonly int FurDark = C(0x4a, 0x3a, 0x2c);
        public static readonly int Cream = C(0xf7, 0xf2, 0xe8);
        public static readonly int CreamDeep = C(0xdd, 0xd2, 0xbe);
        public static readonly int Pink = C(0xe0, 0x91, 0x9f);
        public static readonly int PinkDeep = C(0xc2, 0x6f, 0x80);
        public static readonly int Eye = C(0x17, 0x13, 0x10);
        public static readonly int EyeIris = C(0x7f, 0xae, 0x5f);
        public static readonly int EyeGlow = C(0xff, 0xff, 0xff);
        // 颜色键透明的限制：像素要么不透明要么完全穿透，所以调色板里不放半透明色
        public static readonly int Whisker = C(0xff, 0xf9, 0xee);
        public static readonly int Heart = C(0xff, 0x80, 0x98);
        public static readonly int Zzz = C(0xaa, 0xb8, 0xdd);
        public static readonly int Ground = C(0x00, 0x00, 0x00);
    }

    // ==================== 像素画布 ====================
    /// <summary>
    /// 一块 32 位 ARGB 的像素缓冲。所有绘制都是「逐像素 + 扫描行」，
    /// 放大交给最后的 NearestNeighbor 缩放，保证像素边缘是硬的。
    /// </summary>
    class Canvas
    {
        public readonly int W;
        public readonly int H;
        readonly int[] px;

        public Canvas(int w, int h)
        {
            W = w;
            H = h;
            px = new int[w * h];
        }

        public void Clear()
        {
            Array.Clear(px, 0, px.Length);
        }

        /// <summary>读一个像素的 alpha，给窗口命中测试用</summary>
        public int AlphaAt(int x, int y)
        {
            if (x < 0 || y < 0 || x >= W || y >= H) return 0;
            return (px[y * W + x] >> 24) & 0xFF;
        }

        void Plot(int x, int y, int color)
        {
            if (x < 0 || y < 0 || x >= W || y >= H) return;
            int sa = (color >> 24) & 0xFF;
            if (sa == 0) return;

            int i = y * W + x;
            if (sa == 255)
            {
                px[i] = color;
                return;
            }

            int dst = px[i];
            int da = (dst >> 24) & 0xFF;
            if (da == 0)
            {
                px[i] = color;
                return;
            }

            // 源覆盖式 alpha 混合，够用且便宜
            int inv = 255 - sa;
            int r = (((color >> 16) & 0xFF) * sa + ((dst >> 16) & 0xFF) * inv) / 255;
            int g = (((color >> 8) & 0xFF) * sa + ((dst >> 8) & 0xFF) * inv) / 255;
            int b = ((color & 0xFF) * sa + (dst & 0xFF) * inv) / 255;
            int oa = sa + da * inv / 255;
            px[i] = (oa << 24) | (r << 16) | (g << 8) | b;
        }

        public void Pixel(int x, int y, int color)
        {
            Plot(x, y, color);
        }

        public void Rect(double x, double y, double w, double h, int color)
        {
            int x0 = (int)Math.Round(x);
            int y0 = (int)Math.Round(y);
            int x1 = (int)Math.Round(x + w);
            int y1 = (int)Math.Round(y + h);
            for (int yy = y0; yy < y1; yy++)
                for (int xx = x0; xx < x1; xx++)
                    Plot(xx, yy, color);
        }

        public void Ellipse(double cx, double cy, double rx, double ry, int color)
        {
            if (rx <= 0 || ry <= 0) return;
            int yTop = (int)Math.Round(cy - ry);
            int yBot = (int)Math.Round(cy + ry);
            for (int y = yTop; y <= yBot; y++)
            {
                double dy = (y + 0.5 - cy) / ry;
                double k = 1 - dy * dy;
                if (k <= 0) continue;
                double half = rx * Math.Sqrt(k);
                int x0 = (int)Math.Round(cx - half);
                int x1 = (int)Math.Round(cx + half);
                int w = Math.Max(1, x1 - x0);
                Rect(x0, y, w, 1, color);
            }
        }

        public void Triangle(double ax, double ay, double bx, double by, double cx, double cy, int color)
        {
            double[] xs = new double[4];
            int yTop = (int)Math.Round(Math.Min(ay, Math.Min(by, cy)));
            int yBot = (int)Math.Round(Math.Max(ay, Math.Max(by, cy)));

            for (int y = yTop; y <= yBot; y++)
            {
                int n = 0;
                n = AddCross(xs, n, ax, ay, bx, by, y);
                n = AddCross(xs, n, bx, by, cx, cy, y);
                n = AddCross(xs, n, cx, cy, ax, ay, y);
                if (n < 2) continue;

                double lo = xs[0];
                double hi = xs[0];
                for (int i = 1; i < n; i++)
                {
                    if (xs[i] < lo) lo = xs[i];
                    if (xs[i] > hi) hi = xs[i];
                }
                int x0 = (int)Math.Round(lo);
                int x1 = (int)Math.Round(hi);
                Rect(x0, y, Math.Max(1, x1 - x0), 1, color);
            }
        }

        static int AddCross(double[] buf, int n, double x1, double y1, double x2, double y2, int y)
        {
            if ((y1 <= y && y2 >= y) || (y2 <= y && y1 >= y))
            {
                if (y1 == y2)
                {
                    if (n < buf.Length) buf[n++] = x1;
                    if (n < buf.Length) buf[n++] = x2;
                }
                else
                {
                    if (n < buf.Length) buf[n++] = x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
                }
            }
            return n;
        }

        public void ThickLine(double x0, double y0, double x1, double y1, double size, int color)
        {
            double dx = x1 - x0;
            double dy = y1 - y0;
            int steps = Math.Max(1, (int)Math.Ceiling(Math.Max(Math.Abs(dx), Math.Abs(dy))));
            for (int i = 0; i <= steps; i++)
            {
                double t = (double)i / steps;
                double x = x0 + dx * t;
                double y = y0 + dy * t;
                Rect(x - size / 2.0, y - size / 2.0, size, size, color);
            }
        }

        /// <summary>沿二次贝塞尔画一条粗尾巴</summary>
        public void BezierTail(double x0, double y0, double x1, double y1, double x2, double y2, double size, int color)
        {
            const int Steps = 18;
            double prevX = x0;
            double prevY = y0;
            for (int i = 1; i <= Steps; i++)
            {
                double t = (double)i / Steps;
                double u = 1 - t;
                double x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
                double y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
                ThickLine(prevX, prevY, x, y, size, color);
                prevX = x;
                prevY = y;
            }
        }

        public Bitmap ToBitmap()
        {
            Bitmap bmp = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            BitmapData d = bmp.LockBits(new Rectangle(0, 0, W, H),
                ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            Marshal.Copy(px, 0, d.Scan0, px.Length);
            bmp.UnlockBits(d);
            return bmp;
        }
    }

    // ==================== 绘制参数 ====================
    class Opts
    {
        public double Time;
        public double LookX;
        public double LookY;
        public string EyeMode = "normal";
        public double MouthOpen;
        public bool Blush;
        public double HeadDY;
    }

    // ==================== 猫的精灵 ====================
    static class Sprite
    {
        public const double FootOffset = 58;

        static readonly string[] HeartMap = new string[]
        {
            ".##.##.",
            "#######",
            "#######",
            ".#####.",
            "..###..",
            "...#..."
        };

        /// <summary>眼睛：绿色虹膜 + 黑色竖瞳 + 高光，和网页版一致</summary>
        static void DrawEye(Canvas c, double ex, double ey, double lookX, double lookY, string mode)
        {
            if (mode == "closed")
            {
                c.Rect(ex - 3, ey + 1, 7, 1, Pal.Eye);
                c.Pixel((int)Math.Round(ex - 4), (int)Math.Round(ey + 2), Pal.Eye);
                c.Pixel((int)Math.Round(ex + 4), (int)Math.Round(ey + 2), Pal.Eye);
                return;
            }

            if (mode == "happy")
            {
                c.Rect(ex - 2, ey + 1, 5, 1, Pal.Eye);
                c.Pixel((int)Math.Round(ex - 3), (int)Math.Round(ey), Pal.Eye);
                c.Pixel((int)Math.Round(ex + 3), (int)Math.Round(ey), Pal.Eye);
                return;
            }

            if (mode == "wide")
            {
                c.Ellipse(ex, ey, 4.4, 5, Pal.EyeIris);
                c.Rect(ex - 1, ey - 2.5, 2, 5, Pal.Eye);
                c.Rect(ex - 2.5, ey - 3, 2, 2, Pal.EyeGlow);
                return;
            }

            double x = ex + Math.Round(lookX * 1.6);
            double y = ey + Math.Round(lookY * 1.2);
            c.Ellipse(x, y, 3.8, 4.4, Pal.FurDark);
            c.Ellipse(x, y, 3.4, 3.9, Pal.EyeIris);
            c.Rect(x - 1, y - 2, 2, 4, Pal.Eye);
            c.Rect(x - 2, y - 2.5, 2, 2, Pal.EyeGlow);
        }

        static void DrawEars(Canvas c, double ox, double oy)
        {
            // 往两边让开，额头才留得出地方画 M 纹
            c.Triangle(ox + 21, oy + 3, ox + 13, oy + 18, ox + 29, oy + 13, Pal.FurMid);
            c.Triangle(ox + 21, oy + 7, ox + 16, oy + 16, ox + 26, oy + 13, Pal.Pink);
            c.Triangle(ox + 43, oy + 3, ox + 51, oy + 18, ox + 35, oy + 13, Pal.FurMid);
            c.Triangle(ox + 43, oy + 7, ox + 48, oy + 16, ox + 38, oy + 13, Pal.Pink);
        }

        /// <summary>额头的虎斑 M 纹，狸花猫的标志</summary>
        static void DrawHeadStripes(Canvas c, double ox, double oy)
        {
            c.Rect(ox + 31, oy + 5, 2, 8, Pal.FurDark);
            c.Rect(ox + 28, oy + 7, 1, 5, Pal.FurDark);
            c.Rect(ox + 35, oy + 7, 1, 5, Pal.FurDark);
            c.Rect(ox + 29, oy + 13, 1, 3, Pal.FurDark);
            c.Rect(ox + 34, oy + 13, 1, 3, Pal.FurDark);
        }

        /// <summary>鼻子 + 嘴 + 胡须</summary>
        static void DrawFace(Canvas c, double ox, double oy, double mouthOpen)
        {
            c.Rect(ox + 30, oy + 21, 4, 1, Pal.PinkDeep);
            c.Rect(ox + 31, oy + 22, 2, 1, Pal.PinkDeep);

            if (mouthOpen > 0)
            {
                c.Rect(ox + 31, oy + 23, 2, 3, Pal.PinkDeep);
                c.Rect(ox + 30, oy + 25, 4, 1, Pal.PinkDeep);
            }
            else
            {
                c.Rect(ox + 29, oy + 24, 2, 1, Pal.FurDark);
                c.Rect(ox + 33, oy + 24, 2, 1, Pal.FurDark);
                c.Pixel((int)Math.Round(ox + 31), (int)Math.Round(oy + 25), Pal.FurDark);
                c.Pixel((int)Math.Round(ox + 33), (int)Math.Round(oy + 25), Pal.FurDark);
            }

            c.ThickLine(ox + 27, oy + 23, ox + 15, oy + 21, 1, Pal.Whisker);
            c.ThickLine(ox + 27, oy + 25, ox + 14, oy + 27, 1, Pal.Whisker);
            c.ThickLine(ox + 37, oy + 23, ox + 49, oy + 21, 1, Pal.Whisker);
            c.ThickLine(ox + 37, oy + 25, ox + 50, oy + 27, 1, Pal.Whisker);
        }

        /// <summary>头：白口鼻、M 纹、耳朵、眼睛</summary>
        static void DrawHead(Canvas c, double ox, double oy, Opts o, double bob)
        {
            double hy = oy + 17 + bob;

            c.Ellipse(ox + 32, hy, 14.5, 12.5, Pal.Fur);
            c.Ellipse(ox + 32, hy + 6, 7, 5, Pal.Cream);
            DrawHeadStripes(c, ox, oy + bob);
            DrawEars(c, ox, oy + bob);

            DrawEye(c, ox + 26, hy, o.LookX, o.LookY, o.EyeMode);
            DrawEye(c, ox + 38, hy, o.LookX, o.LookY, o.EyeMode);

            DrawFace(c, ox, oy + bob, o.MouthOpen);
        }

        /// <summary>坐姿的下半身：身体、白胸、虎斑、前爪</summary>
        static void DrawBody(Canvas c, double ox, double oy, double breathe)
        {
            c.Ellipse(ox + 32, oy + 42, 17, 14 + breathe, Pal.Fur);
            c.Ellipse(ox + 32, oy + 40, 9, 11 + breathe * 0.5, Pal.Cream);

            c.Rect(ox + 15, oy + 37, 7, 2, Pal.FurDark);
            c.Rect(ox + 42, oy + 37, 7, 2, Pal.FurDark);
            c.Rect(ox + 14, oy + 44, 6, 2, Pal.FurDark);
            c.Rect(ox + 44, oy + 44, 6, 2, Pal.FurDark);
            c.Rect(ox + 17, oy + 51, 5, 2, Pal.FurDark);
            c.Rect(ox + 42, oy + 51, 5, 2, Pal.FurDark);

            c.Ellipse(ox + 24, oy + 56, 6.2, 3.6, Pal.CreamDeep);
            c.Ellipse(ox + 40, oy + 56, 6.2, 3.6, Pal.CreamDeep);
            c.Ellipse(ox + 24, oy + 55, 5.8, 3.2, Pal.Cream);
            c.Ellipse(ox + 40, oy + 55, 5.8, 3.2, Pal.Cream);
            c.Rect(ox + 22, oy + 55, 1, 3, Pal.CreamDeep);
            c.Rect(ox + 38, oy + 55, 1, 3, Pal.CreamDeep);
        }

        /// <summary>坐着：待机、被摸、吃东西都基于这个姿态</summary>
        public static void Sitting(Canvas c, double ox, double oy, Opts o)
        {
            double breathe = Math.Sin(o.Time * 2.1) * 1.1;
            double headDY = o.HeadDY;

            // 尾巴：尾尖白的，中段三道虎斑环
            double sway = Math.Sin(o.Time * 1.6) * 4;
            double tx0 = ox + 44, ty0 = oy + 46;
            double tx1 = ox + 60 + sway, ty1 = oy + 50;
            double tx2 = ox + 57 + sway * 0.5, ty2 = oy + 26;
            c.BezierTail(tx0, ty0, tx1, ty1, tx2, ty2, 6, Pal.FurMid);
            for (int i = 1; i <= 3; i++)
            {
                double tt = 0.36 + i * 0.17;
                double uu = 1 - tt;
                double rx = uu * uu * tx0 + 2 * uu * tt * tx1 + tt * tt * tx2;
                double ry = uu * uu * ty0 + 2 * uu * tt * ty1 + tt * tt * ty2;
                c.Rect(rx - 3, ry - 2, 6, 3, Pal.FurDark);
            }
            c.Ellipse(tx2, ty2 - 2, 3, 3, Pal.Cream);

            DrawBody(c, ox, oy, breathe);
            DrawHead(c, ox, oy, o, headDY);

            if (o.Blush)
            {
                c.Ellipse(ox + 20, oy + headDY + 23, 3.5, 2.2, Pal.Pink);
                c.Ellipse(ox + 44, oy + headDY + 23, 3.5, 2.2, Pal.Pink);
            }
        }

        /// <summary>走路：身体拉长、腿交替、尾巴翘起</summary>
        public static void Walking(Canvas c, double ox, double oy, Opts o)
        {
            int phase = ((int)(o.Time * 7)) % 2;
            double bob = phase == 1 ? 0 : 1;

            double sway = Math.Sin(o.Time * 4) * 3;
            double wx0 = ox + 45, wy0 = oy + 42;
            double wx1 = ox + 58 + sway, wy1 = oy + 32;
            double wx2 = ox + 55 + sway, wy2 = oy + 14;
            c.BezierTail(wx0, wy0, wx1, wy1, wx2, wy2, 6, Pal.FurMid);
            for (int i = 1; i <= 3; i++)
            {
                double tt = 0.34 + i * 0.18;
                double uu = 1 - tt;
                double rx = uu * uu * wx0 + 2 * uu * tt * wx1 + tt * tt * wx2;
                double ry = uu * uu * wy0 + 2 * uu * tt * wy1 + tt * tt * wy2;
                c.Rect(rx - 3, ry - 2, 6, 3, Pal.FurDark);
            }
            c.Ellipse(wx2, wy2 - 2, 3, 3, Pal.Cream);

            double lLift = phase == 1 ? 3 : 0;
            double rLift = phase == 1 ? 0 : 3;
            c.Rect(ox + 19, oy + 46 - lLift, 7, 11, Pal.Fur);
            c.Rect(ox + 38, oy + 46 - rLift, 7, 11, Pal.Fur);
            c.Rect(ox + 19, oy + 53 - lLift, 7, 4, Pal.Cream);
            c.Rect(ox + 38, oy + 53 - rLift, 7, 4, Pal.Cream);

            c.Ellipse(ox + 32, oy + 39 + bob, 19, 12, Pal.Fur);
            c.Ellipse(ox + 32, oy + 40 + bob, 10, 9, Pal.Cream);
            c.Rect(ox + 13, oy + 34 + bob, 7, 2, Pal.FurDark);
            c.Rect(ox + 44, oy + 34 + bob, 7, 2, Pal.FurDark);
            c.Rect(ox + 12, oy + 40 + bob, 6, 2, Pal.FurDark);
            c.Rect(ox + 46, oy + 40 + bob, 6, 2, Pal.FurDark);

            DrawHead(c, ox, oy, o, bob);
        }

        /// <summary>睡着：蜷成一团，头枕在爪子上，尾巴绕到前面</summary>
        public static void Sleeping(Canvas c, double ox, double oy, Opts o)
        {
            double breathe = Math.Sin(o.Time * 1.2) * 0.9;

            c.BezierTail(ox + 46, oy + 52, ox + 60, oy + 58, ox + 30, oy + 58, 6, Pal.FurMid);
            c.Ellipse(ox + 28, oy + 57, 3, 3, Pal.Cream);

            c.Ellipse(ox + 36, oy + 50, 24, 11 + breathe, Pal.Fur);
            c.Ellipse(ox + 38, oy + 52, 16, 7 + breathe, Pal.Cream);
            c.Rect(ox + 32, oy + 41, 8, 2, Pal.FurDark);
            c.Rect(ox + 43, oy + 42, 7, 2, Pal.FurDark);
            c.Rect(ox + 50, oy + 47, 6, 2, Pal.FurDark);

            c.Ellipse(ox + 18, oy + 44, 12, 9.5, Pal.Fur);
            c.Ellipse(ox + 18, oy + 48, 8, 4.5, Pal.Cream);
            c.Triangle(ox + 10, oy + 33, ox + 6, oy + 44, ox + 18, oy + 38, Pal.FurMid);
            c.Triangle(ox + 26, oy + 33, ox + 31, oy + 42, ox + 20, oy + 38, Pal.FurMid);
            c.Triangle(ox + 10, oy + 37, ox + 9, oy + 42, ox + 16, oy + 39, Pal.Pink);
            c.Rect(ox + 17, oy + 36, 1, 3, Pal.FurDark);
            c.Rect(ox + 13, oy + 37, 1, 2, Pal.FurDark);
            c.Rect(ox + 21, oy + 37, 1, 2, Pal.FurDark);

            c.Rect(ox + 11, oy + 44, 5, 1, Pal.Eye);
            c.Rect(ox + 20, oy + 44, 5, 1, Pal.Eye);
            c.Rect(ox + 17, oy + 48, 3, 1, Pal.PinkDeep);
        }

        /// <summary>被拎起来：四脚乱蹬、眼睛瞪大</summary>
        public static void Held(Canvas c, double ox, double oy, Opts o)
        {
            double swing = Math.Sin(o.Time * 6) * 3;

            c.BezierTail(ox + 46, oy + 42, ox + 58, oy + 52, ox + 54 + swing, oy + 60, 6, Pal.FurMid);
            for (int i = 1; i <= 2; i++)
            {
                c.Rect(ox + 50 + i * 2, oy + 48 + i * 4, 6, 3, Pal.FurDark);
            }

            c.Ellipse(ox + 32, oy + 42, 16, 15, Pal.Fur);
            c.Ellipse(ox + 32, oy + 44, 9, 10, Pal.Cream);

            c.Rect(ox + 18, oy + 52, 6, 8, Pal.Fur);
            c.Rect(ox + 26, oy + 54, 5, 7, Pal.Fur);
            c.Rect(ox + 34, oy + 54, 5, 7, Pal.Fur);
            c.Rect(ox + 41, oy + 52, 6, 8, Pal.Fur);
            c.Ellipse(ox + 21, oy + 59, 3.2, 2.2, Pal.Cream);
            c.Ellipse(ox + 28.5, oy + 60, 3, 2, Pal.Cream);
            c.Ellipse(ox + 36.5, oy + 60, 3, 2, Pal.Cream);
            c.Ellipse(ox + 44, oy + 59, 3.2, 2.2, Pal.Cream);

            Opts held = new Opts();
            held.Time = o.Time;
            held.LookX = o.LookX;
            held.LookY = o.LookY;
            held.EyeMode = "wide";
            held.MouthOpen = 1;
            held.Blush = false;
            DrawHead(c, ox, oy, held, 0);
        }

        /// <summary>画一颗爱心，给开心的时候用</summary>
        public static void DrawHeart(Canvas c, int x, int y, int alpha)
        {
            int color = Pal.WithAlpha(Pal.Heart, alpha);
            for (int r = 0; r < HeartMap.Length; r++)
            {
                string row = HeartMap[r];
                for (int col = 0; col < row.Length; col++)
                {
                    if (row[col] == '#') c.Pixel(x + col, y + r, color);
                }
            }
        }
    }

    // ==================== 状态机 ====================
    class Cat
    {
        public const int ViewW = 96;
        public const int ViewH = 96;
        public const double GroundY = 88;
        public const double MinX = 32;
        public const double MaxX = 64;

        public double X = 40;
        public double Y = GroundY;
        public double VY;

        public string State = "idle";
        public double StateTime;
        public double StateDuration = double.PositiveInfinity;

        public double LookX;
        public double LookY;
        public double LookTargetX;
        public double LookTargetY;

        public double BlinkTimer = 2.5;
        public double Blinking;
        public double MouthOpen;

        public bool Dragging;
        public double DragDX;
        public double DragDY;

        public double ThinkTimer = 2;
        public double TargetX = double.NaN;

        public double Affection;
        public double Fullness = 70;
        public double HeartTimer;

        public readonly Random Rnd = new Random();

        public double SpriteTop
        {
            get { return Y - Sprite.FootOffset; }
        }

        public bool Sleeping
        {
            get { return State == "sleep"; }
        }

        public void SetState(string name, double duration)
        {
            if (State == name)
            {
                StateTime = 0;
                return;
            }
            State = name;
            StateTime = 0;
            StateDuration = duration;
            if (name == "walk" && double.IsNaN(TargetX))
                TargetX = Clamp(X + (Rnd.NextDouble() - 0.5) * 30, MinX, MaxX);
            if (name != "walk") TargetX = double.NaN;
        }

        public static double Clamp(double v, double lo, double hi)
        {
            if (v < lo) return lo;
            if (v > hi) return hi;
            return v;
        }

        /// <summary>被摸：开心、亲密度涨</summary>
        public void Pet()
        {
            SetState("happy", 1.1);
            HeartTimer = 1.1;
            Affection = Clamp(Affection + 3, 0, 100);
        }

        public void Eat()
        {
            SetState("eat", 1.6);
            Fullness = Clamp(Fullness + 18, 0, 100);
        }

        public void Wake()
        {
            if (State == "sleep")
            {
                SetState("idle", double.PositiveInfinity);
                ThinkTimer = 1;
            }
        }

        public void Think(double sleepiness)
        {
            if (Dragging) return;
            if (State == "walk" || State == "eat" || State == "held") return;

            double r = Rnd.NextDouble();

            if (State != "sleep" && r < 0.1 + sleepiness * 0.45)
            {
                SetState("sleep", 6 + Rnd.NextDouble() * 10);
                ThinkTimer = double.PositiveInfinity;
                return;
            }

            if (State == "sleep")
            {
                SetState("idle", double.PositiveInfinity);
                ThinkTimer = 1.5;
                return;
            }

            if (r < 0.5)
            {
                TargetX = Clamp(X + (Rnd.NextDouble() - 0.5) * 34, MinX, MaxX);
                SetState("walk", double.PositiveInfinity);
                ThinkTimer = 4 + Rnd.NextDouble() * 3;
            }
            else
            {
                SetState("idle", double.PositiveInfinity);
                ThinkTimer = 1.6 + Rnd.NextDouble() * 3.2;
            }
        }

        public void Update(double dt, double sleepiness)
        {
            StateTime += dt;

            LookX += (LookTargetX - LookX) * Math.Min(1, dt * 9);
            LookY += (LookTargetY - LookY) * Math.Min(1, dt * 9);

            BlinkTimer -= dt;
            if (Blinking > 0)
            {
                Blinking -= dt;
                if (Blinking <= 0) BlinkTimer = 2.4 + Rnd.NextDouble() * 3.6;
            }
            else if (BlinkTimer <= 0 && State != "sleep")
            {
                Blinking = 0.12;
            }

            if (Dragging) return;

            // 重力
            VY += 700 * dt;
            Y += VY * dt;
            if (Y >= GroundY)
            {
                if (VY > 250) SetState("happy", 0.5);
                Y = GroundY;
                VY = 0;
                if (State == "fall") SetState("idle", double.PositiveInfinity);
            }

            // 走
            if (State == "walk" && !double.IsNaN(TargetX))
            {
                double dx = TargetX - X;
                if (Math.Abs(dx) < 1.5)
                {
                    SetState("idle", double.PositiveInfinity);
                    ThinkTimer = 1.2 + Rnd.NextDouble() * 2.4;
                }
                else
                {
                    X += Math.Sign(dx) * 24 * dt;
                }
            }

            if (!double.IsPositiveInfinity(StateDuration) && StateTime >= StateDuration)
            {
                SetState("idle", double.PositiveInfinity);
                ThinkTimer = 0.8 + Rnd.NextDouble() * 2;
            }

            MouthOpen = State == "eat" ? (Math.Sin(StateTime * 14) > 0 ? 1 : 0) : 0;

            if (HeartTimer > 0) HeartTimer = Math.Max(0, HeartTimer - dt);

            ThinkTimer -= dt;
            if (ThinkTimer <= 0) Think(sleepiness);
        }

        public void Draw(Canvas c, double time)
        {
            double ox = Math.Round(X) - 32;
            double oy = Math.Round(SpriteTop);

            if (State == "happy")
            {
                double k = Math.Max(0, 1 - StateTime / 0.55);
                oy -= Math.Round(Math.Sin(k * Math.PI) * 6);
            }

            Opts o = new Opts();
            o.Time = time;
            o.LookX = LookX;
            o.LookY = LookY;
            o.MouthOpen = MouthOpen;
            o.Blush = State == "happy";
            o.HeadDY = 0;

            if (State == "sleep") o.EyeMode = "closed";
            else if (State == "happy") o.EyeMode = "happy";
            else if (Blinking > 0) o.EyeMode = "closed";
            else o.EyeMode = "normal";

            if (State == "sleep") Sprite.Sleeping(c, ox, oy - 3, o);
            else if (State == "walk") Sprite.Walking(c, ox, oy, o);
            else if (State == "held") Sprite.Held(c, ox, oy, o);
            else if (State == "eat")
            {
                o.HeadDY = 3;
                Sprite.Sitting(c, ox, oy, o);
            }
            else Sprite.Sitting(c, ox, oy, o);

            // 特效
            if (HeartTimer > 0)
            {
                double life = 1 - HeartTimer / 1.1;
                for (int i = 0; i < 3; i++)
                {
                    double phase = life - i * 0.18;
                    if (phase < 0) continue;
                    // 颜色键透明下没有半透明，用「快飘到头就不画」代替渐隐
                    if (1 - phase * 1.3 < 0.25) continue;
                    double rise = phase * 22;
                    int hx = (int)Math.Round(X - 14 + i * 12 + Math.Sin(phase * 5 + i) * 3);
                    int hy = (int)Math.Round(SpriteTop - 12 - rise);
                    Sprite.DrawHeart(c, hx, hy, 255);
                }
            }

            if (State == "sleep")
            {
                for (int i = 0; i < 3; i++)
                {
                    double phase = (time * 0.55 + i * 0.34) % 1.0;
                    if (Math.Sin(phase * Math.PI) < 0.3) continue;
                    int zx = (int)Math.Round(X + 8 + phase * 10);
                    int zy = (int)Math.Round(SpriteTop + 6 - phase * 20);
                    int color = Pal.Zzz;
                    c.Rect(zx, zy, 4, 1, color);
                    c.Rect(zx + 1, zy + 1, 2, 1, color);
                    c.Rect(zx, zy + 2, 1, 1, color);
                    c.Rect(zx, zy + 3, 4, 1, color);
                }
            }
        }
    }

    // ==================== 窗口 ====================
    class PetForm : Form
    {
        const int ViewW = Cat.ViewW;
        const int ViewH = Cat.ViewH;

        readonly Cat cat = new Cat();
        readonly Canvas canvas = new Canvas(ViewW, ViewH);

        // 缩放倍数在 DPI-aware 之后按屏幕算，保证像素是整数倍、不会被系统拉伸糊掉
        int PixelScale;
        Bitmap output;
        Graphics outputG;

        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        double time;
        DateTime lastTick = DateTime.UtcNow;

        bool pressing;
        bool moved;
        Point pressClient;
        DateTime pressAt;
        int pressScreenX;
        int pressScreenY;
        int windowLeftAtPress;
        int windowTopAtPress;

        readonly ContextMenuStrip menu = new ContextMenuStrip();

        // ---- Win32：分层窗口 ----
        [StructLayout(LayoutKind.Sequential)]
        struct POINT { public int x; public int y; }

        [StructLayout(LayoutKind.Sequential)]
        struct SIZE { public int cx; public int cy; }

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        struct BLENDFUNCTION
        {
            public byte BlendOp;
            public byte BlendFlags;
            public byte SourceConstantAlpha;
            public byte AlphaFormat;
        }

        [DllImport("user32.dll", SetLastError = true)]
        static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst,
            ref SIZE psize, IntPtr hdcSrc, ref POINT pprSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);

        [DllImport("user32.dll")]
        static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("gdi32.dll")]
        static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        static extern IntPtr SelectObject(IntPtr hdc, IntPtr h);

        [DllImport("gdi32.dll")]
        static extern bool DeleteDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        static extern bool DeleteObject(IntPtr h);

        const int ULW_ALPHA = 2;
        const byte AC_SRC_OVER = 0;
        const byte AC_SRC_ALPHA = 1;

        // 自己建 32 位 DIB Section：Bitmap.GetHbitmap() 会把 alpha 通道抹掉，
        // 那样分层窗口就是全透明的（踩过一次）。
        [StructLayout(LayoutKind.Sequential)]
        struct BITMAPINFOHEADER
        {
            public uint biSize;
            public int biWidth;
            public int biHeight;
            public ushort biPlanes;
            public ushort biBitCount;
            public uint biCompression;
            public uint biSizeImage;
            public int biXPelsPerMeter;
            public int biYPelsPerMeter;
            public uint biClrUsed;
            public uint biClrImportant;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct BITMAPINFO
        {
            public BITMAPINFOHEADER bmiHeader;
            public uint bmiColors;
        }

        [DllImport("gdi32.dll")]
        static extern IntPtr CreateDIBSection(IntPtr hdc, ref BITMAPINFO pbmi, uint usage,
            out IntPtr ppvBits, IntPtr hSection, uint offset);

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= 0x00080000; // WS_EX_LAYERED
                cp.ExStyle |= 0x00000080; // WS_EX_TOOLWINDOW
                return cp;
            }
        }

        public PetForm()
        {
            ClearLog();

            // 目标：猫在屏幕上占大约 250 个「逻辑像素」，缩放到物理像素时必须取整
            float dpiX = 96f;
            using (Graphics probe = Graphics.FromHwnd(IntPtr.Zero))
            {
                dpiX = probe.DpiX;
            }
            if (dpiX < 72) dpiX = 96f;
            PixelScale = (int)Math.Round(250.0 * (dpiX / 96.0) / 64);
            if (PixelScale < 2) PixelScale = 2;
            if (PixelScale > 10) PixelScale = 10;

            output = new Bitmap(ViewW * PixelScale, ViewH * PixelScale, PixelFormat.Format32bppArgb);

            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            ClientSize = new Size(ViewW * PixelScale, ViewH * PixelScale);
            Text = "DeskCat";
            DoubleBuffered = true;

            // 颜色键透明：品红区域直接穿透，猫身以外不挡鼠标
            BackColor = Color.Fuchsia;
            TransparencyKey = Color.Fuchsia;

            SetStyle(ControlStyles.OptimizedDoubleBuffer
                | ControlStyles.AllPaintingInWmPaint
                | ControlStyles.UserPaint, true);

            outputG = Graphics.FromImage(output);
            outputG.InterpolationMode = InterpolationMode.NearestNeighbor;
            outputG.PixelOffsetMode = PixelOffsetMode.Half;
            outputG.SmoothingMode = SmoothingMode.None;

            // 读上次的状态（位置、亲密度、饱食度）并摆好窗口
            PlaceWindow();

            BuildMenu();

            timer.Interval = 33;
            timer.Tick += OnTick;
        }

        void BuildMenu()
        {
            ToolStripMenuItem petItem = new ToolStripMenuItem("摸一摸");
            petItem.Click += delegate { cat.Wake(); cat.Pet(); };

            ToolStripMenuItem feedItem = new ToolStripMenuItem("喂一条鱼");
            feedItem.Click += delegate { cat.Wake(); cat.Eat(); };

            ToolStripMenuItem sleepItem = new ToolStripMenuItem("去睡觉");
            sleepItem.Click += delegate { cat.SetState("sleep", 20); };

            ToolStripMenuItem hideItem = new ToolStripMenuItem("藏起来一分钟");
            hideItem.Click += delegate
            {
                Visible = false;
                System.Windows.Forms.Timer back = new System.Windows.Forms.Timer();
                back.Interval = 60000;
                back.Tick += delegate
                {
                    back.Stop();
                    back.Dispose();
                    Visible = true;
                };
                back.Start();
            };

            ToolStripMenuItem exitItem = new ToolStripMenuItem("退出");
            exitItem.Click += delegate { Close(); };

            menu.Items.Add(petItem);
            menu.Items.Add(feedItem);
            menu.Items.Add(sleepItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(hideItem);
            menu.Items.Add(exitItem);
            ContextMenuStrip = menu;
        }

        void PlaceWindow()
        {
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;

            string stateFile = StatePath();
            bool placed = false;

            if (File.Exists(stateFile))
            {
                try
                {
                    string[] lines = File.ReadAllLines(stateFile);
                    foreach (string line in lines)
                    {
                        int idx = line.IndexOf('=');
                        if (idx <= 0) continue;
                        string key = line.Substring(0, idx);
                        string val = line.Substring(idx + 1);
                        double num;
                        if (!double.TryParse(val, System.Globalization.NumberStyles.Float,
                                System.Globalization.CultureInfo.InvariantCulture, out num)) continue;

                        if (key == "x")
                        {
                            Left = (int)num;
                            placed = true;
                        }
                        else if (key == "y") Top = (int)num;
                        else if (key == "affection") cat.Affection = num;
                        else if (key == "fullness") cat.Fullness = num;
                    }
                }
                catch (Exception)
                {
                    // 状态文件坏了就退回默认位置，不影响启动
                }
            }

            if (!placed)
            {
                Left = wa.Right - Width - 60;
                Top = wa.Bottom - Height - 100;
            }

            // 位置明显不合理（比如被拖到屏幕外）就直接回右下角
            if (Left < wa.Left - 100 || Left > wa.Right - 60 || Top < wa.Top - 60 || Top > wa.Bottom - 40)
            {
                Left = wa.Right - Width - 60;
                Top = wa.Bottom - Height - 100;
            }

            Log("PlaceWindow wa=(" + wa.Left + "," + wa.Top + ")-(" + wa.Right + "," + wa.Bottom + ")"
                + " size=" + Width + "x" + Height + " at=(" + Left + "," + Top + ")");
        }

        static string StatePath()
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DeskCat");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "state.txt");
        }

        /// <summary>把诊断信息追加到 %APPDATA%\DeskCat\log.txt，方便查问题</summary>
        static void Log(string msg)
        {
            try
            {
                string dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DeskCat");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "log.txt"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + Environment.NewLine);
            }
            catch (Exception)
            {
            }
        }

        /// <summary>每次启动清空上一次的日志，避免越积越大</summary>
        static void ClearLog()
        {
            try
            {
                string dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DeskCat");
                Directory.CreateDirectory(dir);
                File.WriteAllText(Path.Combine(dir, "log.txt"), "");
            }
            catch (Exception)
            {
            }
        }

        void SaveState()
        {
            try
            {
                string text =
                    "x=" + Left.ToString(System.Globalization.CultureInfo.InvariantCulture) + "\n" +
                    "y=" + Top.ToString(System.Globalization.CultureInfo.InvariantCulture) + "\n" +
                    "affection=" + Math.Round(cat.Affection).ToString(System.Globalization.CultureInfo.InvariantCulture) + "\n" +
                    "fullness=" + Math.Round(cat.Fullness).ToString(System.Globalization.CultureInfo.InvariantCulture) + "\n";
                File.WriteAllText(StatePath(), text);
            }
            catch (Exception)
            {
            }
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Log("OnShown 触发");
            Render();
            timer.Start();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            timer.Stop();
            SaveState();
            base.OnFormClosing(e);
        }

        void OnTick(object sender, EventArgs e)
        {
            try
            {
                DateTime now = DateTime.UtcNow;
                double dt = (now - lastTick).TotalSeconds;
                lastTick = now;
                if (dt <= 0 || dt > 0.2) dt = 0.033;
                time += dt;

                UpdateLook();
                double sleepiness = Sleepiness();
                cat.Update(dt, sleepiness);

                if (!cat.Dragging)
                    cat.Fullness = Cat.Clamp(cat.Fullness - dt * 0.004, 0, 100);

                Render();
            }
            catch (Exception ex)
            {
                Log("Tick 异常: " + ex);
                timer.Stop();
            }
        }

        double Sleepiness()
        {
            int h = DateTime.Now.Hour;
            double s = 0.1;
            if (h >= 23 || h < 5) s = 0.9;
            else if (h >= 22 || h < 6) s = 0.68;
            else if (h >= 20 || h < 8) s = 0.34;
            return s;
        }

        void UpdateLook()
        {
            Point cursor = Cursor.Position;
            Point local = PointToClient(cursor);
            double lx = local.X / (double)PixelScale;
            double ly = local.Y / (double)PixelScale;

            double dx = lx - cat.X;
            double dy = ly - (cat.SpriteTop + 14);
            cat.LookTargetX = Cat.Clamp(dx / 34, -1, 1);
            cat.LookTargetY = Cat.Clamp(dy / 24, -1, 1);
        }

        void Render()
        {
            canvas.Clear();
            cat.Draw(canvas, time);

            using (Bitmap raw = canvas.ToBitmap())
            {
                outputG.Clear(Color.Transparent);
                outputG.DrawImage(raw, new Rectangle(0, 0, ViewW * PixelScale, ViewH * PixelScale));
            }

            // 用颜色键做透明：画到窗口时透明处露出背景色，再由 TransparencyKey 穿透
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Color.Fuchsia);
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.SmoothingMode = SmoothingMode.None;
            g.DrawImage(output, 0, 0);
        }


        // ---- 命中测试：猫身以外让鼠标穿过去 ----
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x0084) // WM_NCHITTEST
            {
                int lp = m.LParam.ToInt32();
                int sx = (short)(lp & 0xFFFF);
                int sy = (short)((lp >> 16) & 0xFFFF);
                Point client = PointToClient(new Point(sx, sy));

                if (!IsOpaque(client))
                {
                    m.Result = (IntPtr)(-1); // HTTRANSPARENT
                    return;
                }
            }
            base.WndProc(ref m);
        }

        bool IsOpaque(Point client)
        {
            if (client.X < 0 || client.Y < 0 || client.X >= ViewW * PixelScale || client.Y >= ViewH * PixelScale)
                return false;
            int lx = client.X / PixelScale;
            int ly = client.Y / PixelScale;
            return canvas.AlphaAt(lx, ly) > 24;
        }

        // ---- 鼠标 ----
        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button != MouseButtons.Left) return;

            pressing = true;
            moved = false;
            pressClient = e.Location;
            pressAt = DateTime.UtcNow;

            // 拖窗口用屏幕坐标算，才不会因为窗口自己在动而抖
            Point screen = Cursor.Position;
            pressScreenX = screen.X;
            pressScreenY = screen.Y;
            windowLeftAtPress = Left;
            windowTopAtPress = Top;

            Cursor.Current = Cursors.Hand;
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);

            if (!pressing) return;

            int dx = e.Location.X - pressClient.X;
            int dy = e.Location.Y - pressClient.Y;
            if (!moved && (Math.Abs(dx) > 4 || Math.Abs(dy) > 4))
            {
                moved = true;
                cat.Dragging = true;
                cat.SetState("held", double.PositiveInfinity);
            }

            if (moved)
            {
                Point screen = Cursor.Position;
                Rectangle wa = Screen.PrimaryScreen.WorkingArea;
                // 允许稍微拖出边界，但至少留一大截在屏幕里，免得把猫拖丢了找不回来
                Left = Math.Max(wa.Left - 60,
                    Math.Min(windowLeftAtPress + (screen.X - pressScreenX), wa.Right - 80));
                Top = Math.Max(wa.Top - 40,
                    Math.Min(windowTopAtPress + (screen.Y - pressScreenY), wa.Bottom - 80));
            }
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            if (e.Button != MouseButtons.Left || !pressing) return;

            pressing = false;
            Cursor.Current = Cursors.Default;

            if (cat.Dragging)
            {
                // 放下来，开心地蹦一下
                cat.Dragging = false;
                cat.SetState("happy", 0.5);
                SaveState();
            }
            else
            {
                cat.Wake();
                cat.Pet();
                SaveState();
            }
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            base.OnMouseEnter(e);
            Cursor.Current = Cursors.Hand;
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            if (!pressing) Cursor.Current = Cursors.Default;
        }
    }

    // ==================== 入口 ====================
    static class Program
    {
        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main()
        {
            // 必须在创建任何窗口之前声明 DPI 感知：
            // 否则在系统缩放 175% 的屏幕上，窗口会被整体拉伸，像素猫会糊掉，
            // 而且窗口坐标与真实屏幕坐标对不上。
            try { SetProcessDPIAware(); }
            catch (Exception) { }

            bool createdNew;
            using (Mutex mutex = new Mutex(true, "DeskCat_SingleInstance_Mutex", out createdNew))
            {
                if (!createdNew) return;

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new PetForm());
            }
        }
    }
}
