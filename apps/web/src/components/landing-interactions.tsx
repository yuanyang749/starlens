"use client";

import { useEffect, useRef } from "react";

// 交互元素判定：命中这些元素时恢复原生小手指针，让五角星淡出，避免两种指针叠加。
// 需要和 landing.css 里的例外规则保持同一批选择器。
const INTERACTIVE_SELECTOR = "a, button, input, select, textarea, label, summary, [role='button']";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  scale: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
}

// 中文注释：本组件仅负责 Canvas 鼠标指针粒子系统（RAF + Canvas 领域）。
// 滚动追踪器与滚动驱动动效已迁移至 landing-scroll-animations.tsx（GSAP 统一管理）。
export function LandingInteractions() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 鼠标位置与惯性跟随变量
  const mouseRef = useRef({ x: 0, y: 0, lastX: 0, lastY: 0, speed: 0 });
  const starRef = useRef({ x: 0, y: 0, rotation: 0, targetRotation: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameId = useRef<number>(0);

  // 是否悬停在交互元素上（按钮/链接等）；starAlpha 是它的平滑过渡值，用于让五角星淡入淡出。
  const isOverInteractiveRef = useRef(false);
  const starAlphaRef = useRef(1);

  useEffect(() => {
    // 检查是否非触控设备 (一般为主机/鼠标设备)
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!isTouch) {
      document.documentElement.classList.add("custom-cursor-enabled");
    }

    // 初始化 Canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // 绘制五角星辅助函数
    const drawStar = (
      c: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      spikes: number,
      outerRadius: number,
      innerRadius: number,
      fillColor: string,
      strokeColor: string | null,
      opacity: number,
      rotation: number,
      glowColor: string | null
    ) => {
      c.save();
      c.translate(cx, cy);
      c.rotate(rotation);
      c.globalAlpha = opacity;
      c.beginPath();

      let rot = (Math.PI / 2) * 3;
      const step = Math.PI / spikes;
      c.moveTo(0, -outerRadius);

      for (let i = 0; i < spikes; i++) {
        let x = Math.cos(rot) * outerRadius;
        let y = Math.sin(rot) * outerRadius;
        c.lineTo(x, y);
        rot += step;

        x = Math.cos(rot) * innerRadius;
        y = Math.sin(rot) * innerRadius;
        c.lineTo(x, y);
        rot += step;
      }
      c.lineTo(0, -outerRadius);
      c.closePath();

      // 发光与阴影效果
      if (glowColor) {
        c.shadowBlur = 8;
        c.shadowColor = glowColor;
      } else {
        c.shadowBlur = 0;
      }

      c.fillStyle = fillColor;
      c.fill();

      // 描边效果 (例如给黑色五角星绘制浅色描边，使其在暗色元素前可辨识)
      if (strokeColor) {
        c.strokeStyle = strokeColor;
        c.lineWidth = 1.5;
        c.stroke();
      }

      c.restore();
    };

    // 动画主循环
    const renderLoop = (timestamp: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;
      const star = starRef.current;

      // 1. 计算主星星的平滑跟随 (Lerp)
      const lerpFactor = 0.16;
      star.x += (mouse.x - star.x) * lerpFactor;
      star.y += (mouse.y - star.y) * lerpFactor;

      // 2. 根据移动速度增加额外旋转角
      const dx = mouse.x - mouse.lastX;
      const dy = mouse.y - mouse.lastY;
      mouse.speed = Math.sqrt(dx * dx + dy * dy);
      mouse.lastX = mouse.x;
      mouse.lastY = mouse.y;

      star.targetRotation += 0.015 + mouse.speed * 0.005;
      star.rotation += (star.targetRotation - star.rotation) * 0.1;

      // 3. 计算主五角星的呼吸/闪烁效果 (原本 timestamp * 0.012 太快了，降低为 0.003，让波动更平缓；呼吸幅度由 0.1 调为 0.08)
      const breath = 0.92 + Math.sin(timestamp * 0.003) * 0.08;

      // 2.5 悬停在按钮/链接等交互元素上时，让五角星平滑淡出，把原生小手指针让出来。
      const targetStarAlpha = isOverInteractiveRef.current ? 0 : 1;
      starAlphaRef.current += (targetStarAlpha - starAlphaRef.current) * 0.2;

      // 4. 绘制轨迹粒子
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy + 0.15; // 带有少许重力感下落
        p.alpha -= 0.02; // 逐渐消散
        p.rotation += p.rotationSpeed;

        if (p.alpha <= 0) return false;

        // 绘制拖尾小黑色五角星或微尘 (原本 outerRadius: 6, innerRadius: 2.4, 稍微加大粒子尺寸)
        drawStar(
          ctx,
          p.x,
          p.y,
          5,
          8 * p.scale * p.alpha,
          3.2 * p.scale * p.alpha,
          p.color, // 黑色或暗深灰
          "#ffffff", // 白色细边
          p.alpha,
          p.rotation,
          "rgba(0, 0, 0, 0.2)"
        );
        return true;
      });

      // 5. 如果鼠标在移动，产生新粒子（悬停交互元素时不再产生新粒子，已有的自然消散）
      if (mouse.speed > 1 && !isTouch && !isOverInteractiveRef.current) {
        const particleCount = Math.min(3, Math.floor(mouse.speed * 0.3));
        for (let i = 0; i < particleCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 1.5;
          particlesRef.current.push({
            x: star.x,
            y: star.y,
            vx: Math.cos(angle) * speed + (dx * -0.15),
            vy: Math.sin(angle) * speed + (dy * -0.15),
            alpha: 1.0,
            scale: 0.5 + Math.random() * 0.8,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.1,
            color: Math.random() > 0.4 ? "#0f172a" : "#1e293b", // 深色/黑色粒子
          });
        }
      }

      // 6. 绘制主跟随五角星 (仅在非触摸设备上绘制，将主五角星原本外径 10 调大至 14，内径由 4 调大至 5.6)
      // 悬停交互元素时 starAlphaRef 会淡到 0，接近 0 时直接跳过绘制，让原生小手指针独占显示。
      if (!isTouch && starAlphaRef.current > 0.01) {
        drawStar(
          ctx,
          star.x,
          star.y,
          5,
          14 * breath,
          5.6 * breath,
          "#0f172a", // 酷黑主题色填充
          "#ffffff", // 亮白描边
          starAlphaRef.current,
          star.rotation,
          "rgba(15, 23, 42, 0.35)" // 黑色漫散射阴影
        );
      }

      animationFrameId.current = requestAnimationFrame(renderLoop);
    };

    animationFrameId.current = requestAnimationFrame(renderLoop);

    const onPointerMove = (event: PointerEvent) => {
      // 写入 Canvas 动效位置
      mouseRef.current.x = event.clientX;
      mouseRef.current.y = event.clientY;

      // 写入 --landing-pointer-x/y，驱动产品预览卡片的 3D 视差倾斜
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      document.documentElement.style.setProperty("--landing-pointer-x", x.toFixed(4));
      document.documentElement.style.setProperty("--landing-pointer-y", y.toFixed(4));

      // 命中检测：鼠标下方是否为按钮/链接等交互元素，命中则让五角星淡出，露出原生小手指针
      // （touch 设备本就不绘制五角星，跳过这次检测省一次 elementFromPoint 调用）。
      if (!isTouch) {
        const hitTarget = document.elementFromPoint(event.clientX, event.clientY);
        isOverInteractiveRef.current = Boolean(hitTarget?.closest(INTERACTIVE_SELECTOR));
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId.current);
      document.documentElement.classList.remove("custom-cursor-enabled");
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
      }}
      aria-hidden="true"
    />
  );
}
