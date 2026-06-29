"use client";

import Link from "next/link";
import { useState } from "react";
import { Github, Menu, X } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { GitHubSignInButton } from "./github-sign-in-button";

// 中文注释：导航条目集中在此处，桌面横向导航与移动端下拉菜单共用同一份数据。
const navItems = [
  { href: "#demo", label: "演示" },
  { href: "#pain", label: "痛点" },
  { href: "#features", label: "功能" },
  { href: "#workflow", label: "工作方式" },
  { href: "#providers", label: "AI 与协议" },
  { href: "#deploy", label: "开源与自部署" },
  { href: "/docs", label: "文档" },
];

/**
 * 落地页头部（client 组件）。
 * 桌面端展示横向导航；移动端折叠为汉堡菜单，点击展开下拉面板，点击任一项后自动收起。
 */
export function LandingHeader({ githubAuthEnabled }: { githubAuthEnabled: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="landing-header">
      <div className="landing-header__inner">
        <Link href="/" className="landing-brand" aria-label="Starlens 首页">
          <BrandLogo size={30} className="rounded-lg" priority />
          <span>Starlens</span>
        </Link>
        <nav className="landing-nav" aria-label="落地页导航">
          {navItems.map((item) => (
            <a href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="landing-header__actions">
          <button
            type="button"
            className="landing-menu-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={menuOpen}
            aria-controls="landing-nav-mobile"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="landing-auth-wrapper">
            <GitHubSignInButton
              githubAuthEnabled={githubAuthEnabled}
              className="landing-button-circle"
              disabledTitle="当前本地环境尚未配置 GitHub OAuth。"
            >
              <div className="landing-button-circle__inner">
                <Github className="h-5 w-5" />
                <span className="landing-button-circle__text">登录</span>
              </div>
            </GitHubSignInButton>
          </div>
        </div>
      </div>
      <nav
        id="landing-nav-mobile"
        className={`landing-nav-mobile ${menuOpen ? "is-open" : ""}`}
        aria-label="移动端导航"
      >
        {navItems.map((item) => (
          <a href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
