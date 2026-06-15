/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // Docker 이미지(서버리스 번들)용
};
export default nextConfig;
