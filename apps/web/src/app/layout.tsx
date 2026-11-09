import type { Metadata } from "next";
import "./globals.css";
import LegalConsentGate from "@/components/LegalConsentGate";
import CookieConsentBanner from "@/components/CookieConsentBanner";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://cities-builder-nest.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CB Nest | Smart Estate & Community Management",
    template: "%s | CB Nest",
  },
  description:
    "CB Nest connects residents, security teams, event organisers and estate managers through one estate-management platform.",
  applicationName: "CB Nest",
  openGraph: {
    type: "website",
    url: siteUrl,
    locale: "en_NG",
    siteName: "CB Nest",
    title: "CB Nest | Smart Estate & Community Management",
    description:
      "A connected platform for smarter estate living and management.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CB Nest | Smart Estate & Community Management",
    description:
      "A connected platform for smarter estate living and management.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LegalConsentGate>{children}</LegalConsentGate>
        <CookieConsentBanner />
      </body>
    </html>
  );
}
