import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wohu Talent OS · HR 招聘工作台",
  description: "把岗位准备、候选人采集、评分、面试和安全触达连接成一套可审计的招聘系统。",
  openGraph: {
    title: "Wohu Talent OS · HR 招聘工作台",
    description: "让每一次招聘决定，都有据可循。",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Wohu Talent OS HR 招聘工作台" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wohu Talent OS · HR 招聘工作台",
    description: "让每一次招聘决定，都有据可循。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
