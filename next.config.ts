import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@typesafe-ai/sdk"],
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
