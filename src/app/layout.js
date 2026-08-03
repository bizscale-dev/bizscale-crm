import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Bizscale CRM - SEO Campaign Management",
  description: "Professional SEO campaign management platform for tracking links, associates, and content delivery",
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  }
};

// Daily sync now runs via Vercel Cron hitting /api/cron/daily-sync (see vercel.json) —
// serverless functions can't keep an in-process node-cron timer alive between requests.

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
