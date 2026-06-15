"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { signIn } from "next-auth/react";

type GitHubSignInButtonProps = {
  children: ReactNode;
  className: string;
  githubAuthEnabled: boolean;
  callbackUrl?: string;
  disabledTitle?: string;
};

export function GitHubSignInButton({
  children,
  className,
  githubAuthEnabled,
  callbackUrl = "/app",
  disabledTitle = "当前本地环境尚未配置 GitHub OAuth。",
}: GitHubSignInButtonProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!githubAuthEnabled) {
    return (
      <button
        type="button"
        disabled
        title={disabledTitle}
        className={`${className} cursor-not-allowed opacity-55`}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={submitting}
      onClick={() => {
        setSubmitting(true);
        void signIn("github", { callbackUrl });
      }}
      className={submitting ? `${className} opacity-90` : className}
      aria-busy={submitting}
    >
      {submitting ? "正在跳转..." : children}
    </button>
  );
}
