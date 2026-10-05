import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@shop/contracts", "@shop/domain"],
  poweredByHeader: false,
};

export default config;
