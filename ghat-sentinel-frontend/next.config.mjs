/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server build used by the Docker image (harmless on Vercel).
  output: "standalone",
  images: {
    // Only local images from /public are used.
    unoptimized: true,
  },
};
export default nextConfig;
