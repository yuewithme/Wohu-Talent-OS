import type { NextConfig } from "next";

const isPagesBuild = process.env.NEXT_OUTPUT_EXPORT === "1";
const staticBasePath = process.env.NEXT_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(isPagesBuild ? { output: "export" } : {}),
  basePath: staticBasePath,
  assetPrefix: staticBasePath,
  images: { unoptimized: true },
};

export default nextConfig;
