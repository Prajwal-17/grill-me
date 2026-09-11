import type { Metadata } from "next";
import localFont from "next/font/local";
import { QueryProvider } from "../shared/components/query-provider";
import {
  ThemeProvider,
  themeScript,
} from "../shared/components/theme-provider";
import { UIProvider } from "../shared/components/ui/ui-provider";
import "./globals.css";
const sans = localFont({
  src: "./fonts/IBMPlexSans-Latin.woff2",
  variable: "--font-plex-sans",
  display: "swap",
  weight: "100 700",
});
const mono = localFont({
  src: "./fonts/IBMPlexMono-Latin.woff2",
  variable: "--font-plex-mono",
  display: "swap",
  weight: "400",
});
export const metadata: Metadata = {
  title: "Grill Me",
  description: "Engineering practice, made for what you want to learn.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={
          sans.variable +
          " " +
          mono.variable +
          " min-h-dvh font-sans antialiased"
        }
      >
        <ThemeProvider>
          <QueryProvider>
            <UIProvider>{children}</UIProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
