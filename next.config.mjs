const firebaseAuthHelperHost = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`
  : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!firebaseAuthHelperHost) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${firebaseAuthHelperHost}/__/auth/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.exercisedb.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
