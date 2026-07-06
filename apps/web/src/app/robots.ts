import type { MetadataRoute } from "next";

const SITE_URL = "https://starlens.520ai.xin";

// 中文注释：允许爬虫索引公开页面，禁止 /app、/api、/mobile 等需要登录或属接口的路径。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/api", "/mobile"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
