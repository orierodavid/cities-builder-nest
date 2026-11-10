const http = require("node:http");

const users = new Map([
  ["load-manager-token", "11111111-1111-4111-8111-111111111111"],
  ["load-resident-token", "22222222-2222-4222-8222-222222222222"],
  ["load-security-token", "33333333-3333-4333-8333-333333333333"],
  ["load-organiser-token", "44444444-4444-4444-8444-444444444444"],
]);

function send(res, status, body, objectResponse = false) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(objectResponse && Array.isArray(body) ? body[0] ?? null : body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  if (req.method === "GET" && url.pathname === "/auth/v1/user") {
    const id = users.get(token);
    if (!id) return send(res, 401, { message: "Invalid test credential" });
    return send(res, 200, {
      id, aud: "authenticated", role: "authenticated",
      email: id + "@example.test", email_confirmed_at: "2026-01-01T00:00:00.000Z",
    });
  }

  if (req.method === "GET" && url.pathname === "/rest/v1/users") {
    const idFilter = url.searchParams.get("id") || "";
    const id = idFilter.startsWith("eq.") ? idFilter.slice(3) : users.get(token);
    const known = [...users.values()].includes(id);
    const rows = known ? [{ id, is_active: true }] : [];
    return send(res, 200, rows, (req.headers.accept || "").includes("application/vnd.pgrst.object+json"));
  }

  if (req.method === "POST" && url.pathname === "/rest/v1/rpc/get_legal_consent_status") {
    return send(res, 200, {
      requiresAcceptance: false, configurationRequired: false, accepted: true,
      documents: [], acceptedDocumentIds: [], pendingDocumentIds: [],
    });
  }

  return send(res, 404, { message: "Unknown isolated auth-stub route" });
});

server.listen(4100, "127.0.0.1", () => {
  process.stdout.write("Isolated Supabase Auth/PostgREST stub listening on 127.0.0.1:4100\n");
});
