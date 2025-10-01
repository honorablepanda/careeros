/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // keep Prisma out of the client bundle, avoid bundling issues
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
};

export default nextConfig;
