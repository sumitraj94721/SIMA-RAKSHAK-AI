import http from "node:http";

const PORT = 8000;
const users = new Map();
const alerts = [];

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(data));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
    });

    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    sendJson(response, 200, { message: "Backend Running" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "backend",
      users: users.size,
      alerts: alerts.length,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/detect/alerts") {
    sendJson(response, 200, { alerts });
    return;
  }

  if (request.method === "POST" && url.pathname === "/signup") {
    try {
      const body = await parseBody(request);
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();

      if (!username || !password) {
        sendJson(response, 400, { detail: "Username and password are required" });
        return;
      }

      if (users.has(username)) {
        sendJson(response, 400, { detail: "User already exists" });
        return;
      }

      users.set(username, password);
      sendJson(response, 200, { message: "Signup successful", username });
    } catch (error) {
      sendJson(response, 400, { detail: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/login") {
    try {
      const body = await parseBody(request);
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();

      if (!users.has(username)) {
        sendJson(response, 401, { detail: "User not found" });
        return;
      }

      if (users.get(username) !== password) {
        sendJson(response, 401, { detail: "Invalid password" });
        return;
      }

      sendJson(response, 200, { message: "Login successful", username });
    } catch (error) {
      sendJson(response, 400, { detail: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/detect") {
    const timestamp = new Date().toISOString();
    const result = {
      status: "SAFE",
      faces: 1,
      emotion: "Neutral",
      confidence: 0.95,
      message: "Face detected successfully",
      timestamp,
    };

    alerts.unshift({
      time: timestamp,
      status: result.status,
      message: result.message,
      faces: result.faces,
      confidence: result.confidence,
    });
    alerts.splice(20);

    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { detail: "Not Found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SentriAI backend running at http://127.0.0.1:${PORT}`);
});
