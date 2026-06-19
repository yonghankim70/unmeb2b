import path from "path";
import { fileURLToPath } from "url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  turbopack: {
    root: appDir,
  },
  outputFileTracingExcludes: {
    "/*": [
      "./.next/dev/**/*",
      "./.next/cache/**/*",
      "./.open-next/**/*",
      "./build/**/*",
      "./image-cache/**/*",
      "./public/image-cache/**/*",
      "./node_modules/better-sqlite3/**/*",
      "./node_modules/@types/better-sqlite3/**/*",
      "./dev-server.log",
    ],
  },
  allowedDevOrigins: ["unmeb2b.com", "www.unmeb2b.com", "localhost:2000"],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/image-cache/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
