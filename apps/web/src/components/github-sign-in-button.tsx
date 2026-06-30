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
      className={`${className} ${submitting ? "is-submitting" : ""}`}
      aria-busy={submitting}
    >
      {submitting ? (
        <span className="github-sign-in-loading">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="github-octocat-loading"
          >
            <path
              className="octocat-path-body"
              d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
            />
            <path
              className="octocat-path-tail"
              d="M9 18c-4.51 2-5-2-7-2"
            />
          </svg>
          <span className="github-sign-in-loading__text">正在跳转...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
