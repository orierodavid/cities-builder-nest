import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://cities-builder-nest.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/login",
          "/dashboard",
          "/admin",
          "/facility-manager",
          "/users",
          "/estates",
          "/properties",
          "/subscriptions",
          "/payments",
          "/analytics",
          "/support",
          "/system-logs",
          "/alerts",
          "/settings",
          "/residents",
          "/visitor-management",
          "/events",
          "/service-charges",
          "/maintenance",
          "/facility-management",
          "/communications",
          "/reports",
          "/profile",
          "/legal-documents",
          "/welcome-email",
          "/api/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
