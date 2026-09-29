import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider, themeInitScript } from "@/components/theme";
import { BackendStatusProvider } from "@/components/backend-status";

export const metadata: Metadata = {
  title: { default: "API Testing Agent", template: "%s · API Testing Agent" },
  description: "Generate, run and analyze API tests from an OpenAPI spec.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>
          <BackendStatusProvider>
            <AppShell>{children}</AppShell>
          </BackendStatusProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
