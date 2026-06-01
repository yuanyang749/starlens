"use client";

import { useEffect } from "react";

export function shouldUseMobileWorkspace({
  maxTouchPoints,
  pointerCoarse,
  userAgent,
  viewportWidth,
}: {
  maxTouchPoints: number;
  pointerCoarse: boolean;
  userAgent: string;
  viewportWidth: number;
}) {
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent);

  return mobileUserAgent || (pointerCoarse && maxTouchPoints > 0 && viewportWidth <= 820);
}

export function MobileWorkspaceRedirect() {
  useEffect(() => {
    const pointerCoarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const shouldRedirect = shouldUseMobileWorkspace({
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      pointerCoarse,
      userAgent: navigator.userAgent,
      viewportWidth: window.innerWidth,
    });

    if (!shouldRedirect) {
      return;
    }

    const target = new URL("/mobile", window.location.origin);
    target.search = window.location.search;

    // 中文注释：用浏览器端判断保留桌面首屏 SSR，同时让手机入口自动切到移动工作台。
    window.location.replace(target.toString());
  }, []);

  return null;
}

export function DesktopWorkspaceRedirect() {
  useEffect(() => {
    const pointerCoarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const shouldStayMobile = shouldUseMobileWorkspace({
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      pointerCoarse,
      userAgent: navigator.userAgent,
      viewportWidth: window.innerWidth,
    });

    if (shouldStayMobile) {
      return;
    }

    const target = new URL("/app", window.location.origin);

    // 中文注释：桌面端误入或刷新移动路由时，回到桌面工作台入口，保持入口语义对称。
    window.location.replace(target.toString());
  }, []);

  return null;
}
