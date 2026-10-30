import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Cities Builder Nest | Management Portal", description: "Estate administration and facility management portal." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
