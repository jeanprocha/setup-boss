import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { AppProviders } from "./providers";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Setup Boss — Mission Control",
  description: "Supervisão operacional do runtime Setup Boss (UI MVP Fase 5).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistMono.variable} min-h-dvh font-sans antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
