"use client";

import { signIn } from "next-auth/react";
import { Github } from "lucide-react";

export function MobileSignIn() {
  return (
    <main className="mobile-shell">
      <section className="mobile-empty">
        <div className="mobile-brand">
          <strong>Starlens</strong>
          <span>面向 GitHub Stars 的移动工作台</span>
        </div>
        <p className="mt-4">使用 GitHub 登录后，可以搜索、整理并同步你的 Stars。</p>
        <button
          type="button"
          className="mobile-button mobile-button--primary mt-5 w-full"
          onClick={() => void signIn("github", { callbackUrl: "/" })}
        >
          <Github className="h-4 w-4" />
          使用 GitHub 登录
        </button>
      </section>
    </main>
  );
}
