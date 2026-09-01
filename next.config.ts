import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pg", "pdf-parse", "mammoth"],
  async headers() {
    return [
      {
        source: "/ai-widget.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/widget.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/embed",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/docs", destination: "/knowledge-base", permanent: false },
      { source: "/docs/:path*", destination: "/knowledge-base/:path*", permanent: false },
      { source: "/dashboard/tickets", destination: "/tickets", permanent: false },
      { source: "/dashboard/tickets/:id", destination: "/tickets/:id", permanent: false },
      { source: "/dashboard/messages", destination: "/chat", permanent: false },
      { source: "/dashboard/messages/:id", destination: "/chat/:id", permanent: false },
      { source: "/dashboard/notifications", destination: "/notifications", permanent: false },
      { source: "/dashboard/notifications/:id", destination: "/notifications", permanent: false },
      { source: "/support-agent/notifications", destination: "/notifications", permanent: false },
      { source: "/support-agent/notifications/:id", destination: "/notifications", permanent: false },
    ];
  },
};

export default nextConfig;
