/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/components/landing-page";

const { signInMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

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
  vi.unstubAllGlobals();
});

describe("landing page workspace entry", () => {
  it("renders explicit GitHub login controls instead of a direct workspace link", () => {
    const { el } = mount(<LandingPage githubAuthEnabled />);

    const workspaceLinks = Array.from(el.querySelectorAll("a")).filter((link) =>
      link.textContent?.includes("工作台"),
    );

    expect(workspaceLinks).toHaveLength(0);
    expect(el.textContent).toContain("使用 GitHub 登录");
    expect(el.textContent).toContain("进入工作台");
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
