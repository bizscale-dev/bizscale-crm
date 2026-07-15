/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@libsql/client', 'bcryptjs'],
  images: {
    disableStaticImages: false,
    formats: ['image/webp', 'image/avif'],
  }
};

export default nextConfig;
