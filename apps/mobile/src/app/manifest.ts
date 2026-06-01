import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Starlens Mobile",
    short_name: "Starlens",
    description: "Mobile workbench for GitHub Stars.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fb",
    theme_color: "#111827",
    icons: [
      {
        src: "/brand/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
