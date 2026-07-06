import { NextResponse } from "next/server";
import webPackage from "../../../../package.json";

const GITHUB_REPO = "yuanyang749/starlens";

export const dynamic = "force-dynamic";

// 按 "." 分段数值比较（不用 latest !== current——GitHub Release 打 tag 往往滞后于
// 已部署的 package.json 版本号，这会导致"当前版本比 latest 还新"时被误判为"发现新版本"）。
// 返回 >0 表示 a 更新，0 表示相同，<0 表示 a 更旧。
function compareVersions(a: string, b: string) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function GET() {
  const current = webPackage.version;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 3600 },
      },
    );

    if (!res.ok) {
      return NextResponse.json({ current, latest: null, hasUpdate: false, releaseUrl: null });
    }

    const data = (await res.json()) as { tag_name: string; html_url: string };
    const latest = data.tag_name.replace(/^v/, "");
    const hasUpdate = compareVersions(latest, current) > 0;

    return NextResponse.json({ current, latest, hasUpdate, releaseUrl: data.html_url });
  } catch {
    return NextResponse.json({ current, latest: null, hasUpdate: false, releaseUrl: null });
  }
}
