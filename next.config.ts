import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // ssh2 (under ssh2-sftp-client, the media storage client) has a native add-on the bundler cannot place, so it is
  // loaded from node_modules at runtime instead. Without this the production build fails on Linux.
  serverExternalPackages: ["ssh2-sftp-client", "ssh2"],
  // The proxy owns trailing slashes, so an old address with one reaches it intact and gets a single 301.
  skipTrailingSlashRedirect: true,
  // Product images were moved to the media server; the old addresses (still in the catalogue data) are served from there.
  async rewrites() {
    return { beforeFiles: [{ source: "/assets/img/products/:file", destination: "/media/products/legacy/:file" }] };
  },
  async redirects() {
    // The first rebuild put the six-burner category at /ovens/6-burner.
    return [{ source: "/ovens/6-burner", destination: "/ovens/6-burner-range", permanent: true }];
  },
};

export default nextConfig;
