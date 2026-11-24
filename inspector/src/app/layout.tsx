import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEPBox Inspector — Stellar Anchor Workbench",
  description:
    "Live Traffic Stream, Chaos Fault Injector, and Webhook Replay Console for SEPBox Anchor Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#09090B] text-[#F2F2EE] antialiased selection:bg-[#F2F2EE]/10 selection:text-[#F2F2EE]">
        {children}
      </body>
    </html>
  );
}
