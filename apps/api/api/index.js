import app from "../dist/server.js";

export default function handler(req, res) {
  const url = req.url || "/";
  const queryIndex = url.indexOf("?");
  const pathname = queryIndex < 0 ? url : url.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : url.slice(queryIndex);
  req.url = pathname.replace(/^\\/api(?:\\/)?$/, "/") + query;
  app(req, res);
}
