import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { BottomNav } from "@/components/layout/BottomNav";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { NetworkStatus } from "@/components/ui/NetworkStatus";
import RealtimeSyncProvider from "@/components/providers/RealtimeSyncProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shivkush Nursery",
  description: "Nursery Management System",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Prevents zooming on inputs in mobile
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 pb-16 pb-safe" suppressHydrationWarning>
        <LanguageProvider>
          <QueryProvider>
            <RealtimeSyncProvider>
              <NetworkStatus />
              <main className="flex-1 overflow-y-auto">
                {children}
              </main>
              <BottomNav />
            </RealtimeSyncProvider>
          </QueryProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
