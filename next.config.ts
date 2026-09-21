import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import path from "node:path";

void initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  serverExternalPackages: ["@typesafe-ai/sdk"],
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
