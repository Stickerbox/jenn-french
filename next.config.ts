import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A published page may be up to MAX_PAGE_BYTES (2 MB) and arrives as a
    // server-action argument. The default cap is 1 MB, which would reject a
    // page the app itself considers valid.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
