"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent, ReactNode } from "react";

type ClickSparkProps = {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  easing?: "linear" | "ease-in" | "ease-in-out" | "ease-out";
  extraScale?: number;
  children: ReactNode;
};

type Spark = {
  x: number;
  y: number;
  angle: number;
  startTime: number;
};

function easeValue(progress: number, easing: ClickSparkProps["easing"]) {
  switch (easing) {
    case "linear":
      return progress;
    case "ease-in":
      return progress * progress;
    case "ease-in-out":
      return progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
    default:
      return progress * (2 - progress);
  }
}

export default function ClickSpark({
  sparkColor = "#f00",
  sparkSize = 30,
  sparkRadius = 30,
  sparkCount = 8,
  duration = 660,
  easing = "ease-out",
  extraScale = 1,
  children,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const frameRef = useRef<number | null>(null);
  const startAnimationRef = useRef<(() => void) | null>(null);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const parent = canvas.parentElement;
    if (!parent) {
      return;
    }

    let resizeTimeout: number | null = null;

    const resizeCanvas = () => {
      const { width, height } = parent.getBoundingClientRect();
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const handleResize = () => {
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }
      resizeTimeout = window.setTimeout(resizeCanvas, 100);
    };

    resizeCanvas();

    // 中文注释：测试环境或旧浏览器没有 ResizeObserver 时，退回到窗口 resize 同步尺寸。
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        if (resizeTimeout) {
          window.clearTimeout(resizeTimeout);
        }
      };
    }

    const observer = new ResizeObserver(handleResize);
    observer.observe(parent);

    return () => {
      observer.disconnect();
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) {
      return;
    }

    // 中文注释：用户开启减少动态效果时，立即停止并清空 canvas 动画。
    const syncMotionPreference = () => {
      reducedMotionRef.current = mediaQuery.matches;

      if (!mediaQuery.matches) {
        return;
      }

      sparksRef.current = [];
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    syncMotionPreference();
    mediaQuery.addEventListener("change", syncMotionPreference);

    return () => {
      mediaQuery.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    // 中文注释：仅在存在火花时驱动逐帧绘制，避免页面空闲时持续占用动画帧。
    const draw = (timestamp: number) => {
      if (reducedMotionRef.current) {
        sparksRef.current = [];
        context.clearRect(0, 0, canvas.width, canvas.height);
        frameRef.current = null;
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= duration) {
          return false;
        }

        const progress = elapsed / duration;
        const eased = easeValue(progress, easing);
        const distance = eased * sparkRadius * extraScale;
        const lineLength = sparkSize * (1 - eased);

        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);

        // 绘制闪烁的五角星粒子
        const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) => {
          let rot = (Math.PI / 2) * 3;
          let sx = cx;
          let sy = cy;
          const step = Math.PI / spikes;

          ctx.beginPath();
          ctx.moveTo(cx, cy - outerRadius);
          for (let i = 0; i < spikes; i++) {
            sx = cx + Math.cos(rot) * outerRadius;
            sy = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(sx, sy);
            rot += step;

            sx = cx + Math.cos(rot) * innerRadius;
            sy = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(sx, sy);
            rot += step;
          }
          ctx.lineTo(cx, cy - outerRadius);
          ctx.closePath();
          ctx.fillStyle = sparkColor;
          ctx.fill();
        };

        // 增加闪烁（Opacity 抖动/呼吸）和星形的大小随时间衰减
        const currentOpacity = (1 - eased) * (0.8 + Math.sin(timestamp * 0.05) * 0.2);
        context.save();
        context.globalAlpha = Math.max(0, Math.min(1, currentOpacity));
        
        const starSize = sparkSize * (1 - eased);
        drawStar(context, x1, y1, 5, starSize, starSize * 0.4);
        context.restore();

        return true;
      });

      if (sparksRef.current.length > 0) {
        frameRef.current = window.requestAnimationFrame(draw);
      } else {
        context.clearRect(0, 0, canvas.width, canvas.height);
        frameRef.current = null;
      }
    };

    const startAnimation = () => {
      if (!reducedMotionRef.current && frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(draw);
      }
    };

    startAnimationRef.current = startAnimation;

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      startAnimationRef.current = null;
    };
  }, [duration, easing, extraScale, sparkColor, sparkRadius, sparkSize]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 中文注释：只响应真实主指针按下，避免键盘 click 在左上角误触发火花。
    if (reducedMotionRef.current || !event.isPrimary || event.button !== 0) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const now = performance.now();

    const nextSparks = Array.from({ length: sparkCount }, (_, index) => ({
      x,
      y,
      angle: (2 * Math.PI * index) / sparkCount,
      startTime: now,
    }));

    sparksRef.current.push(...nextSparks);
    startAnimationRef.current?.();
  };

  return (
    <div className="click-spark" onPointerDown={handlePointerDown}>
      <canvas ref={canvasRef} className="click-spark__canvas" aria-hidden="true" />
      <div className="click-spark__content">{children}</div>
    </div>
  );
}
