"use client";

import { signIn } from "next-auth/react";
import { Github } from "lucide-react";

export function MobileSignIn() {
  return (
    <main className="mobile-shell">
      <section className="mobile-empty">
        <div className="mobile-brand">
          <strong>Starlens</strong>
          <span>Mobile workbench for your GitHub Stars</span>
        </div>
        <p className="mt-4">Sign in with GitHub to search, organize, and sync your starred repositories.</p>
        <button
          type="button"
          className="mobile-button mobile-button--primary mt-5 w-full"
          onClick={() => void signIn("github", { callbackUrl: "/" })}
        >
          <Github className="h-4 w-4" />
          Sign in with GitHub
        </button>
      </section>
    </main>
  );
}
