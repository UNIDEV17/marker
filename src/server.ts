import Fastify from "fastify";
import { pool } from "./db.js";
import { Bookmark } from "./types.js";
import { bookmarkchecker } from "./helper.js";
import argon2 from "@node-rs/argon2";
import crypto from "crypto";
import * as zod from "zod";
const userSchema = zod.object({
  username: zod.string().min(3).max(20),
  email: zod.string().email(),
  password: zod.string().min(6).max(100),
});

/*
let bookmarkone = {
  URL: "https://www.google.com",
  title: "Google",
};
bookmarkchecker(bookmarkone);
*/

const app = Fastify({ logger: true });
const DUMMY_HASH =
  "$argon2id$v=19$m=4096,t=3,p=1$Wm9uZQ$0v8J5x4F5g5g5g5g5g5g5g"; // Dummy hash for timing attack prevention
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

app.post("/auth/register", async (request, reply) => {
  try {
    const parsedData = userSchema.parse(request.body);
    console.log(request.body, "request body");
    const hashedPassword = await argon2.hash(parsedData.password);
    await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
      [parsedData.username, parsedData.email, hashedPassword],
    );
    console.log("Parsed user data:", parsedData);
    return true;
  } catch (error) {
    reply.code(400);
    console.error("Error registering user:", error);
    return { ok: false, error: "Invalid user data1" };
  }
});

app.post("/auth/login", async (request, reply) => {
  try {
    const parseddata = userSchema
      .pick({ email: true, password: true })
      .parse(request.body);
    console.log(parseddata, "parsed data");
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [
      parseddata.email,
    ]);
    const user = rows[0];

    const hashToVerify = user ? user.password : null;
    const isVaild = await argon2.verify(hashToVerify, parseddata.password);
    if (!user || !isVaild) {
      reply.code(401);
      return { ok: false, error: "Invalid email or password" };
    }

    const token = crypto.randomBytes(32).toString("base64");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await pool.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [tokenHash, user.id, expiresAt],
    );

    console.log(rows, "user rows");
    return { ok: true, token };
  } catch (error) {
    reply.code(400);
    console.error("Error logging in user:", error);
    return { ok: false, error: "Invalid login data" };
  }
});
await app.listen({ port: 3000 });
// TODO: add /health route
