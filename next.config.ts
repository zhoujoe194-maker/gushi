import type {NextConfig} from "next";
const nextConfig:NextConfig={output:"standalone",distDir:process.env.APP_BUILD_DIR||".next",poweredByHeader:false,serverExternalPackages:["node:sqlite"],devIndicators:false};
export default nextConfig;
