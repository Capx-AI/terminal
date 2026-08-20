import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const docs = fileURLToPath(new URL("../docs/", import.meta.url));
const port = Number(process.env.TERMINAL_PROGRESS_PORT ?? 4199);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (relative.includes("..")) {
    response.writeHead(400).end("bad path");
    return;
  }
  try {
    const fromDocs = relative.startsWith("docs/");
    const body = await readFile(
      join(fromDocs ? docs : root, fromDocs ? relative.slice(5) : relative),
    );
    response.writeHead(200, {
      "content-type": types[extname(relative)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`capx terminal progress http://127.0.0.1:${port}/\n`);
});
