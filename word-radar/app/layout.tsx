import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "搜词雷达 · 发现下一次机会",
  description: "从真实信号出发，发现、验证并追踪值得做的关键词机会。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
