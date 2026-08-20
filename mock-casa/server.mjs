import { createServer } from "node:http";
import { FIXTURES } from "./fixtures.mjs";

const port = Number(process.env.MOCK_CASA_PORT ?? 4201);
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

function isMint(mint) {
  return (
    typeof mint === "string" &&
    mint.length >= 32 &&
    mint.length <= 44 &&
    BASE58.test(mint) &&
    mint.endsWith("capx")
  );
}

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, { status: "ok", fixtures: Object.keys(FIXTURES).length, surface: "1.2" });
    return;
  }
  const match = url.pathname.match(/^\/v1\/tokens\/([^/]+)$/);
  if (request.method !== "GET" || !match) {
    json(response, 404, { error: "NOT_FOUND", message: "No such route" });
    return;
  }
  const mint = decodeURIComponent(match[1]);
  if (!isMint(mint)) {
    json(response, 400, {
      error: "INVALID_MINT",
      message: "Mint must be Solana base58 ending in capx",
    });
    return;
  }
  const doc = FIXTURES[mint];
  if (!doc) {
    json(response, 404, {
      error: "TOKEN_NOT_BOUND",
      message: "Casa has never bound this mint",
    });
    return;
  }
  json(response, 200, doc);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`mock casa http://127.0.0.1:${port}/\n`);
});
