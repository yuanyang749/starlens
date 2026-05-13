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
  transpilePackages: ["@starlens/core"],
  turbopack: {
    root: workspaceRoot,
  },
};

export default withMDX(nextConfig);
