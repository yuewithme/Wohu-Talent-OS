import type { NextConfig } from "next";

const isPagesBuild = process.env.NEXT_OUTPUT_EXPORT === "1";
const pagesBasePath = isPagesBuild ? "/Wohu-Talent-OS" : "";

const nextConfig: NextConfig = {
  ...(isPagesBuild ? { output: "export" } : {}),
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  images: { unoptimized: true },
};

export default nextConfig;
