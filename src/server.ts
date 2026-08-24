import Fastify from "fastify";
import { pool } from "./db.js";

const app = Fastify({ logger: true });

app.get("/", async () => {
  return { ok: true };
});

app.get("/health", async () => {
  try {
    await pool.query("SELECT 1");
    return { ok: true, db: "up" };
  } catch (error) {
    reply.code(503);
    return { ok: false, db: "down" };
  }
});
app.get("/what", async (params: type) => {
  return { status: "fine" };
});
await app.listen({ port: 3000 });
// TODO: add /health route
