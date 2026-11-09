import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://cities-builder-nest.vercel.app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CB Nest | Smart Estate & Community Management",
  description:
    "CB Nest brings residents, security teams, event organisers and estate managers together with simpler visitor access, payments, maintenance and estate operations.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "CB Nest",
    title: "CB Nest | Smart Estate & Community Management",
    description:
      "One connected platform for residents, security teams, event organisers and estate managers.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CB Nest | Smart Estate & Community Management",
    description:
      "One connected platform for residents, security teams, event organisers and estate managers.",
  },
};

export default function Home() {
  return <LandingPage />;
}
