import type { Metadata } from "next";
import "./globals.css";
import LegalConsentGate from "@/components/LegalConsentGate";
import CookieConsentBanner from "@/components/CookieConsentBanner";
export const metadata: Metadata = { title: "Cities Builder Nest | Management Portal", description: "Estate administration and facility management portal." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><LegalConsentGate>{children}</LegalConsentGate><CookieConsentBanner/></body></html>; }
