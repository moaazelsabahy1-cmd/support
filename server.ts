import { createServer } from "node:http";
import { parse } from "node:url";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Server as IOServer } from "socket.io";
import { closeDb, connectDb } from "./lib/db";
import { attachSocket } from "./server/socket";

loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "localhost";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();
  try {
    await connectDb();
  } catch (err) {
    console.warn("PostgreSQL unavailable — app will still serve pages:", err);
  }

  const httpServer = createServer((req, res) => {
    const parsed = parse(req.url || "", true);
    handle(req, res, parsed);
  });

  const io = new IOServer(httpServer, {
    path: process.env.NEXT_PUBLIC_SOCKET_PATH || "/socket.io",
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || `http://${hostname}:${port}`,
      credentials: true,
    },
  });
  attachSocket(io);

  const bindHost = process.env.HOST || (dev ? undefined : "127.0.0.1");
  const onListen = () => {
    console.log(`Solvio ready on http://${bindHost || hostname}:${port}`);
  };
  if (bindHost) httpServer.listen(port, bindHost, onListen);
  else httpServer.listen(port, onListen);

  const shutdown = async () => {
    console.log("Shutting down...");
    io.close();
    httpServer.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
