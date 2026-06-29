"use client";

import { useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// 中文注释：右侧滚动追踪器条目，与各 section 的 id 一一对应。
const trackerItems = [
  { id: "hero", label: "首屏" },
  { id: "demo", label: "演示" },
  { id: "pain", label: "痛点" },
  { id: "features", label: "功能" },
  { id: "workflow", label: "工作方式" },
  { id: "providers", label: "AI 服务" },
  { id: "deploy", label: "部署" },
];

/**
 * 集中管理落地页所有 GSAP 滚动动效与滚动追踪器。
 * - 使用 useGSAP 确保卸载时自动 revert 所有动画与 ScrollTrigger。
 * - 选择器作用于整个文档（动画目标在父级 landing-page 中），因此不绑定 scope。
 * - 通过 gsap.matchMedia 区分桌面/移动并尊重 prefers-reduced-motion。
 */
export function LandingScrollAnimations() {
  const [activeSection, setActiveSection] = useState("hero");

  useGSAP(() => {
    // ===== 滚动追踪器（始终启用，不受 reduced-motion 影响）=====
    // 顶部进度条与右侧追踪器竖条共用 --landing-scroll-progress 变量。
    ScrollTrigger.create({
      trigger: document.documentElement,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        document.documentElement.style.setProperty(
          "--landing-scroll-progress",
          String(self.progress),
        );
      },
    });

    // 各区块对应一个 ScrollTrigger，进入活跃区间时高亮对应圆点。
    trackerItems.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      ScrollTrigger.create({
        trigger: el,
        start: "top 45%",
        end: "bottom 45%",
        onToggle: (self) => {
          if (self.isActive) setActiveSection(id);
        },
      });
    });

    // ===== 装饰 / 入场动画（响应断点与无障碍）=====
    const mm = gsap.matchMedia();

    mm.add(
      {
        isDesktop: "(min-width: 781px)",
        isMobile: "(max-width: 780px)",
        reduceMotion: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const { isDesktop, reduceMotion } = context.conditions ?? {};
        // 减少动态效果：跳过所有入场/视差动画，内容直接可见。
        if (reduceMotion) return;

        // a. 首屏入场：copy 子元素 stagger 上移淡入 + 预览缩放淡入 + 滚动提示延迟淡入。
        gsap.from(".landing-hero__copy > *", {
          y: 24,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.12,
        });
        gsap.from(".landing-hero__visual", {
          scale: 0.94,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          delay: 0.3,
        });
        gsap.from(".landing-hero__scroll-hint", {
          opacity: 0,
          duration: 0.6,
          delay: 1,
        });

        // b. Hero 滚动视差退出（仅桌面）：copy 上移淡出、预览缩放淡出。
        if (isDesktop) {
          gsap.to(".landing-hero__copy", {
            y: -80,
            opacity: 0.25,
            ease: "none",
            scrollTrigger: {
              trigger: "#hero",
              start: "top top",
              end: "bottom top",
              scrub: 1,
            },
          });
          gsap.to(".landing-hero__visual", {
            scale: 0.92,
            opacity: 0.35,
            ease: "none",
            scrollTrigger: {
              trigger: "#hero",
              start: "top top",
              end: "bottom top",
              scrub: 1,
            },
          });
        }

        // c. 区块标题揭示：进入视口 80% 时内部元素上移淡入。
        gsap.utils
          .toArray<HTMLElement>(".landing-section-heading")
          .forEach((heading) => {
            gsap.from(heading.children, {
              y: 30,
              opacity: 0,
              duration: 0.6,
              ease: "power2.out",
              stagger: 0.15,
              scrollTrigger: {
                trigger: heading,
                start: "top 80%",
                toggleActions: "play none none reverse",
              },
            });
          });

        // c2. 演示视频舞台揭示：进入视口时缩放淡入。
        gsap.from(".landing-demo__stage", {
          scale: 0.95,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: "#demo",
            start: "top 78%",
            toggleActions: "play none none reverse",
          },
        });

        // d. 卡片 batch 错落入场：先设初始隐藏态（useGSAP 在 paint 前执行，无 FOUC）。
        const cardSelector =
          ".landing-pain-card, .landing-feature-card, .landing-workflow-grid > article, .landing-provider-card, .landing-deploy-grid > article";
        gsap.set(cardSelector, { opacity: 0, y: 60 });
        ScrollTrigger.batch(cardSelector, {
          start: "top 85%",
          batchMax: 4,
          onEnter: (els) =>
            gsap.to(els, {
              opacity: 1,
              y: 0,
              duration: 0.6,
              ease: "power2.out",
              stagger: 0.12,
              overwrite: true,
            }),
          onLeaveBack: (els) =>
            gsap.to(els, { opacity: 0, y: 60, overwrite: true }),
        });

        // e. 装饰元素轻微视差（仅桌面）：provider logo 与部署区图标。
        if (isDesktop) {
          gsap.utils
            .toArray<HTMLElement>(
              ".landing-provider-logo, .landing-deploy-grid article svg",
            )
            .forEach((deco) => {
              gsap.fromTo(
                deco,
                { y: -16 },
                {
                  y: 16,
                  ease: "none",
                  scrollTrigger: {
                    trigger: deco,
                    start: "top bottom",
                    end: "bottom top",
                    scrub: 2,
                  },
                },
              );
            });
        }

        // f. 安全提示滑入。
        gsap.from(".landing-security-note", {
          x: -30,
          opacity: 0,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".landing-security-note",
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        });

        // g. 页脚 CTA 揭示。
        gsap.from(".landing-footer__cta", {
          scale: 0.9,
          opacity: 0,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".landing-footer__cta",
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        });
      },
    );
  });

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
