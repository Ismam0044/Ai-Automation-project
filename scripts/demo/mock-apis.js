import http from "node:http";

const port = Number(process.env.MOCK_API_PORT ?? 4010);
const modes = { failing: "healthy", slow: "fast", empty: "nonempty" };

function send(response, status, body) {
  const json = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json) });
  response.end(json);
}

const server = http.createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  if (request.method === "POST" && path === "/control") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      let command;
      try { command = JSON.parse(body); } catch { return send(response, 400, { error: "invalid_json" }); }
      if (command.endpoint === "failing" && ["healthy", "failing"].includes(command.mode)) modes.failing = command.mode;
      else if (command.endpoint === "slow" && ["fast", "slow"].includes(command.mode)) modes.slow = command.mode;
      else if (command.endpoint === "empty" && ["empty", "nonempty"].includes(command.mode)) modes.empty = command.mode;
      else return send(response, 400, { error: "invalid_control" });
      return send(response, 200, { modes: { ...modes } });
    });
    return;
  }
  if (request.method !== "GET") return send(response, 405, { error: "method_not_allowed" });
  if (path === "/healthy") return send(response, 200, [{ id: 1 }, { id: 2 }]);
  if (path === "/failing") {
    return modes.failing === "failing"
      ? send(response, 500, { error: "synthetic_failure" })
      : send(response, 200, [{ id: 1 }]);
  }
  if (path === "/slow") {
    const delay = modes.slow === "slow" ? 6_000 : 10;
    return setTimeout(() => send(response, 200, [{ id: 1 }]), delay);
  }
  if (path === "/empty") return send(response, 200, modes.empty === "empty" ? [] : [{ id: 1 }]);
  return send(response, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Synthetic monitor APIs listening at http://127.0.0.1:${port}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
