/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/* to the Express backend on port 3001
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
};

export default nextConfig;
