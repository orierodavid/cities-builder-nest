import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://cities-builder-nest.vercel.app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CB Nest | Smart Estate & Community Management",
  description:
    "CB Nest connects residents, security teams, facility managers and Super Admins with visitor access, resident-led events, payments, maintenance and estate operations.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "CB Nest",
    title: "CB Nest | Smart Estate & Community Management",
    description:
      "One connected platform for residents, security teams, facility managers and Super Admins.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CB Nest | Smart Estate & Community Management",
    description:
      "One connected platform for residents, security teams, facility managers and platform administrators.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "CB Nest",
      url: siteUrl,
      description:
        "CB Nest provides connected estate and community management tools for residents, security teams, facility managers and platform administrators.",
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: "CB Nest",
      url: siteUrl,
      publisher: { "@id": `${siteUrl}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      name: "CB Nest",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "An estate and community management platform for visitor access, service charges, payments, maintenance, events and estate operations.",
      url: siteUrl,
      publisher: { "@id": `${siteUrl}/#organization` },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <LandingPage />
    </>
  );
}
