/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/components/landing-page";

const { signInMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(node));
  return { el, root };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("landing page workspace links", () => {
  it("links workspace entry points to the app instead of the NextAuth sign-in page", () => {
    const { el } = mount(<LandingPage githubAuthEnabled />);

    const workspaceLinks = Array.from(el.querySelectorAll("a")).filter((link) =>
      link.textContent?.includes("工作台"),
    );

    expect(workspaceLinks.length).toBeGreaterThan(0);
    expect(workspaceLinks.every((link) => link.getAttribute("href") === "/app"))
      .toBe(true);
    expect(el.innerHTML).not.toContain("/api/auth/signin");
  });

  it("keeps explicit GitHub login on the OAuth flow", async () => {
    const { el } = mount(<LandingPage githubAuthEnabled />);
    const loginButton = Array.from(el.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("使用 GitHub 登录"),
    );

    expect(loginButton).toBeTruthy();
    await act(async () => {
      loginButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(signInMock).toHaveBeenCalledWith("github", { callbackUrl: "/app" });
  });
});
