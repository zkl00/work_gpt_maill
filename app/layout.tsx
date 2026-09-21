import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "到期提醒中心",
  description: "按账号到期日自动发送邮件提醒",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
