import { NextResponse } from "next/server";
import webPackage from "../../../../package.json";

const GITHUB_REPO = "yuanyang749/starlens";

export const revalidate = 3600;

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
    const hasUpdate = latest !== current;

    return NextResponse.json({ current, latest, hasUpdate, releaseUrl: data.html_url });
  } catch {
    return NextResponse.json({ current, latest: null, hasUpdate: false, releaseUrl: null });
  }
}
