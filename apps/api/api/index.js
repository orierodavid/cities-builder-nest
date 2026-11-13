import app from "../dist/server.js";

export default function handler(req, res) {
  const incoming = new URL(req.url || "/api", "http://vercel.internal");
  const originalPath = incoming.searchParams.get("__cbnest_path") || "";
  incoming.searchParams.delete("__cbnest_path");

  const encodedPath = originalPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const query = incoming.searchParams.toString();
  req.url = "/" + encodedPath + (query ? "?" + query : "");
  app(req, res);
}
