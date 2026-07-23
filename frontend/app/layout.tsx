import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { NotificationProvider } from "@/contexts/notification-context";
import { RealtimeProvider } from "@/contexts/realtime-context";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";

export const metadata: Metadata = {
  title: {
    default: "Elite Time – Gestion du temps de travail",
    template: "%s | Elite Time",
  },
  description:
    "Plateforme complète de gestion du temps de travail, des pointages, des congés et des rapports pour employés, managers et administrateurs.",
  applicationName: "Elite Time",
  keywords: [
    "gestion du temps",
    "pointage",
    "congés",
    "RH",
    "présence",
    "Elite Time",
  ],
  authors: [{ name: "Elite Network" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Elite Time",
  },
  openGraph: {
    title: "Elite Time – Gestion du temps de travail",
    description:
      "Optimisez le suivi des horaires, des présences, des retards et des congés de vos équipes avec Elite Time.",
    url: "/",
    siteName: "Elite Time",
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Elite Time – Gestion du temps de travail",
    description:
      "Application de gestion du temps de travail pour employés, managers et administrateurs.",
  }
};

export const viewport: Viewport = {
  themeColor: "#0b84c6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Next 16 émet "mobile-web-app-capable" ; iOS Safari ne lit que le préfixe apple- */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NotificationProvider>
            <AuthProvider>
              <RealtimeProvider>
                <Toaster />
                {children}
              </RealtimeProvider>
            </AuthProvider>
          </NotificationProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
