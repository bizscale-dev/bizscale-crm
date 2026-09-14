/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@libsql/client', 'bcryptjs'],
  images: {
    disableStaticImages: false,
    formats: ['image/webp', 'image/avif'],
  },
  // Manager Tasks' proof-image submission sends a base64 data URL (~2MB image,
  // ~2.7MB after base64 inflation) straight through a server action — well past
  // Next's default 1MB server action body limit. No other feature in this app
  // currently needs a raised limit.
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
