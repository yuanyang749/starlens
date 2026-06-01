import { describe, expect, it } from "vitest";
import { shouldUseMobileWorkspace } from "@/components/mobile-workspace-redirect";

describe("mobile workspace redirect detection", () => {
  it("uses the mobile workspace for phone user agents", () => {
    expect(
      shouldUseMobileWorkspace({
        maxTouchPoints: 0,
        pointerCoarse: false,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        viewportWidth: 1200,
      }),
    ).toBe(true);
  });

  it("uses the mobile workspace for coarse narrow touch devices", () => {
    expect(
      shouldUseMobileWorkspace({
        maxTouchPoints: 5,
        pointerCoarse: true,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
        viewportWidth: 390,
      }),
    ).toBe(true);
  });

  it("keeps desktop browsers on the desktop workbench", () => {
    expect(
      shouldUseMobileWorkspace({
        maxTouchPoints: 0,
        pointerCoarse: false,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
        viewportWidth: 1440,
      }),
    ).toBe(false);
  });
});
