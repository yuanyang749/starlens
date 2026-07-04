import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    // 中文注释：启用 GitHub 风格 Markdown，保证表格、任务列表等基础文档语法正常渲染。
    remarkPlugins: ["remark-gfm"],
  },
});

const nextConfig: NextConfig = {
  // 中文注释：允许文档页直接使用 MDX，保持用户文档可读、可维护。
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  // 中文注释：自托管 Docker 部署只复制独立运行产物，减少镜像体积和运行时依赖。
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ["@starlens-app/core", "@starlens/mobile", "@starlens/server", "@starlens/workbench"],
  turbopack: {
    root: workspaceRoot,
  },
  // 中文注释:安全响应头——防止点击劫持(X-Frame-Options)、MIME 嗅探(X-Content-Type-Options)、
  // 降级攻击(HSTS)、Referer 泄露、敏感能力滥用(Permissions-Policy)。
  // CSP 用宽松策略(允许 unsafe-inline 的 script/style),因为 NextAuth 和内联样式依赖此;
  // frame-ancestors 'none' 等价于 X-Frame-Options: DENY。
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withMDX(nextConfig);
