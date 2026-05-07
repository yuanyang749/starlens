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
  disabledTitle = "GitHub OAuth is not configured in this local environment.",
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
      {submitting ? "Redirecting..." : children}
    </button>
  );
}

