"use client";

import { useEffect, useState } from "react";

const trackerItems = [
  { id: "hero", label: "首屏" },
  { id: "pain", label: "痛点" },
  { id: "features", label: "功能" },
  { id: "workflow", label: "工作方式" },
  { id: "providers", label: "AI 服务" },
  { id: "deploy", label: "部署" },
];

export function LandingInteractions() {
  const [activeSection, setActiveSection] = useState("hero");

  useEffect(() => {
    let frame = 0;

    const updateScrollState = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      document.documentElement.style.setProperty("--landing-scroll-progress", String(progress));

      const current = trackerItems
        .map((item) => {
          const node = document.getElementById(item.id);
          return {
            id: item.id,
            offset: node ? Math.abs(node.getBoundingClientRect().top - window.innerHeight * 0.28) : Infinity,
          };
        })
        .sort((a, b) => a.offset - b.offset)[0]?.id;

      if (current) {
        setActiveSection(current);
      }
    };

    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateScrollState);
    };

    const onPointerMove = (event: PointerEvent) => {
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      // 中文注释：把鼠标位置写入 CSS 变量，用于首屏卡片的轻微视差与倾斜。
      document.documentElement.style.setProperty("--landing-pointer-x", x.toFixed(4));
      document.documentElement.style.setProperty("--landing-pointer-y", y.toFixed(4));
    };

    updateScrollState();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <div className="landing-scroll-tracker" aria-label="页面滚动进度">
      <span className="landing-scroll-tracker__bar" />
      {trackerItems.map((item) => (
        <a
          href={`#${item.id}`}
          className={activeSection === item.id ? "is-active" : ""}
          key={item.id}
          aria-label={`跳转到${item.label}`}
        >
          <i />
          <span>{item.label}</span>
        </a>
      ))}
    </div>
  );
}
