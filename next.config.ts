import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only the Docker image wants a self-contained server folder. Vercel and
  // `pnpm start` do not, and ignore it when it is unset.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
