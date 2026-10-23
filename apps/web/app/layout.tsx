import { QueryProvider } from "@/shared/components/query-provider";
import { themeScript } from "@/shared/components/theme-provider";
import { UIProvider } from "@/shared/components/ui/ui-provider";
import "katex/dist/katex.min.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const sans = localFont({
  src: "../assets/fonts/IBMPlexSans-Latin.woff2",
  variable: "--font-plex-sans",
  display: "swap",
  weight: "100 700",
});
const mono = localFont({
  src: "../assets/fonts/IBMPlexMono-Latin.woff2",
  variable: "--font-plex-mono",
  display: "swap",
  weight: "400",
});
export const metadata: Metadata = {
  title: "Grill Me",
  description: "Implementation builds, shaped around what you want to make.",
};

const isDevelopment =
  (process.env.NEXT_PUBLIC_APP_ENV ?? "development") === "development";

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
        <QueryProvider>
          <UIProvider>{children}</UIProvider>
        </QueryProvider>
        {isDevelopment && (
          <div
            aria-label="Development environment"
            className="pointer-events-none fixed bottom-3 right-3 z-[100] rounded-md border border-line bg-elevated px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider text-muted"
          >
            DEV
          </div>
        )}
      </body>
    </html>
  );
}
