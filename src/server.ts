import Fastify from "fastify";
import { pool } from "./db.js";
import { Bookmark } from "./types.js";
import { bookmarkchecker } from "./helper.js";

/*
let bookmarkone = {
  URL: "https://www.google.com",
  title: "Google",
};
bookmarkchecker(bookmarkone);
*/

const app = Fastify({ logger: true });

app.get("/", async () => {
  return { ok: true };
});

app.get("/health", async (_request, reply) => {
  try {
    await pool.query("SELECT 1");
    return { ok: true, db: "up" };
  } catch (error) {
    reply.code(503);
    return { ok: false, db: "down" };
  }
});
app.get("/what", async () => {
  return { status: "fine" };
});
app.get("/bookmarks", async (_request, reply) => {
  try {
    const { rows } = await pool.query<Bookmark[]>("SELECT * FROM bookmarks");
    console.log("rows are shown", rows, typeof rows);
    return rows;
  } catch (error) {
    reply.code(500);
    return { ok: false, error: "Unable to load bookmarks" };
  }
});
app.post("/bookmarks", async (request, reply) => {
  const { url, title } = request.body as { url: string; title: string };
  try {
    if (!bookmarkchecker({ URL: url, title })) {
      reply.code(400);
      return { ok: false, error: "Invalid bookmark data" };
    }
    const { rows } = await pool.query(
      'INSERT INTO bookmarks ("URL", "title") VALUES ($1, $2) RETURNING *',
      [url, title],
    );
    return rows[0] as Bookmark;
  } catch (error) {
    console.error("Error creating bookmark:", error);
    reply.code(500);
    return { ok: false, error: "Unable to create bookmark" };
  }
});
await app.listen({ port: 3000 });
// TODO: add /health route
