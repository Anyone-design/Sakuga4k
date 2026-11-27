import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sakuga4K — Anime Video Upscaler Studio",
  description: "Native 4K neural video upscaler for anime video editors powered by Google Colab GPU & PyTorch FP16",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${jakarta.variable}`}>
      <body className="min-h-screen bg-[#050507] text-zinc-100 antialiased flex flex-col justify-between selection:bg-indigo-500/20 selection:text-white">
        
        {/* Subtle Ambient Studio Spotlight */}
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.08),transparent_60%)]"
        />

        {/* Global Navigation Header */}
        <Header />

        {/* Studio Content Viewport */}
        <div className="relative flex-1 flex flex-col w-full min-w-0">
          {children}
        </div>

        {/* Global Minimalist Footer */}
        <footer className="relative z-10 border-t border-white/[0.06] py-4 px-4 sm:px-6 text-xs text-zinc-500 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span>Sakuga4K v1.1</span>
            <span>•</span>
            <span>CRF 16 Visually Lossless</span>
          </div>
          <div>Designed for Anime Video Editors</div>
        </footer>

      </body>
    </html>
  );
}
