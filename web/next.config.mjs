/** @type {import('next').NextConfig} */
const isCI = process.env.CI === 'true';

const nextConfig = {
  // Don't let ESLint/TS break production builds in CI (E2E focuses on runtime)
  eslint: {
    ignoreDuringBuilds: isCI,
  },
  typescript: {
    ignoreBuildErrors: isCI,
  },

  experimental: {
    // keep Prisma out of the client bundle, avoid bundling issues
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
};

export default nextConfig;
