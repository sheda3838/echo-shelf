import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "xlsx",
    "pptx-text-parser",
    "tesseract.js",
  ],
};

export default nextConfig;
