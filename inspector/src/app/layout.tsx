import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEPBox Inspector | Stellar Anchor Live Workbench",
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
      <body className="bg-[#090D16] text-slate-100 antialiased selection:bg-cyan-500/20 selection:text-cyan-300">
        {children}
      </body>
    </html>
  );
}
