import type { Metadata } from "next";
import localFont from "next/font/local";
import { QueryProvider } from "../shared/components/query-provider";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Grill-Me",
  description: "Small engineering challenges, made for what you just learned.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-canvas font-sans text-foreground antialiased selection:bg-brand selection:text-white`}
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
