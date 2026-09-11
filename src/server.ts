import Fastify, { fastify } from "fastify";
import { pool } from "./db.js";
import { Bookmark } from "./types.js";
import { bookmarkchecker } from "./helper.js";
import argon2 from "@node-rs/argon2";
import crypto from "crypto";
import * as zod from "zod";
import cookie from "@fastify/cookie";
import { requireAuth } from "./auth.js";
import { generateUUID } from "./middleware.js";
import { request } from "https";
import { AppError } from "./errors.js";

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
await app.register(cookie, {
  secret: process.env.COOKIE_SECRET || "change-this-in-production", // for signed cookies
  hook: "onRequest", // parse cookies on every request
  parseOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // false in dev
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days in ms
    path: "/",
  },
});

const sessions = new Map();

app.decorate("sessions", sessions);

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
app.get("/bookmarks", { preHandler: requireAuth }, async (request, reply) => {
  try {
    const objtest =
      (request.query as { limit?: number; cursor?: string }) || {};
    console.log("Query parameters:", objtest.limit, objtest.cursor);
    console.log(
      "Fetching bookmarks",
      request.query,
      request.user,
      request.params,
    );
    const { rows } = await pool.query<Bookmark[]>(
      "SELECT * FROM bookmarks WHERE user_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3",
      [
        request.user!.id,
        objtest.cursor || new Date().toISOString(),
        objtest.limit || 10,
      ],
    );

    console.log(rows, "rows");

    return rows;
  } catch (error) {
    reply.code(500);
    return { ok: false, error: "Unable to load bookmarks" };
  }
});
app.delete(
  "/bookmarks/:id",
  { preHandler: requireAuth },
  async (request, reply) => {
    const { id } = request.params as { id: number };
    if (request.user?.id !== id) {
      reply.code(403);
      return { ok: false, error: "You cannot delete your own bookmark" };
    }
    try {
      await pool.query("DELETE FROM bookmarks WHERE id = $1 AND user_id = $2", [
        id,
        request.user!.id,
      ]);
      return { ok: true };
    } catch (error) {
      console.error("Error deleting bookmark:", error);
      reply.code(500);
      return { ok: false, error: "Unable to delete bookmark" };
    }
  },
);
app.patch(
  "/bookmarks/:id",
  { preHandler: requireAuth },
  async (request, reply) => {
    const { id } = request.params as { id: number };
    const { url, title } = request.body as { url?: string; title?: string };
    if (request.user?.id !== id) {
      reply.code(403);
      return { ok: false, error: "You cannot update your own bookmark" };
    }
    try {
      await pool.query(
        "UPDATE bookmarks SET url = $1, title = $2 WHERE id = $3 AND user_id = $4",
        [url, title, id, request.user!.id],
      );
      return { ok: true };
    } catch (error) {
      console.error("Error updating bookmark:", error);
      reply.code(500);
      return { ok: false, error: "Unable to update bookmark" };
    }
  },
);
app.post("/bookmarks", { preHandler: requireAuth }, async (request, reply) => {
  const { url, title } = request.body as { url: string; title: string };
  try {
    if (!bookmarkchecker({ URL: url, title })) {
      reply.code(400);
      return { ok: false, error: "Invalid bookmark data" };
    }
    const { rows } = await pool.query(
      'INSERT INTO bookmarks ("URL", "title", user_id) VALUES ($1, $2, $3) RETURNING *',
      [url, title, request.user!.id],
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

app.post("/auth/logout", async (request, reply) => {
  try {
    const sessionId = request.cookies.sessionId;
    console.log("nothing here", sessionId);
    if (sessionId) {
      console.log("Logging out user with sessionId:", sessionId);
      const tokenHash = crypto
        .createHash("sha256")
        .update(sessionId)
        .digest("hex");
      console.log("Token hash to delete:", tokenHash);
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [
        tokenHash,
      ]);
      reply.clearCookie("sessionId");
    }
  } catch (error) {
    console.error("Error logging out user:", error);
  }
});
app.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
  return { ok: true, user: request.user }; // if requireAuth sets request.user
});
app.post("/auth/login", async (request, reply) => {
  try {
    generateUUID(request, reply);
    console.log("Generated UUID:", request.uuid);
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
    const { rows: existingSessions } = await pool.query(
      "SELECT 1 FROM sessions WHERE user_id = $1 AND expires_at > NOW()",
      [user.id],
    );
    console.log(existingSessions, "existing sessions");
    if (existingSessions.length > 0) {
      reply.code(400);
      return { ok: false, error: "Session already exists" };
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
    reply.setCookie("sessionId", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
      path: "/",
    });
    return { ok: true, token };
  } catch (error) {
    reply.code(400);
    console.error("Error logging in user:", error);
    return { ok: false, error: "Invalid login data" };
  }
});
app.setErrorHandler((error, request, reply) => {
  // Log full detail server-side always — this never reaches the client
  request.log.error({ err: error, reqId: request.id }, "Request error");

  // 1. Your own known error types
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      ok: false,
      error: error.message,
    });
  }

  // 2. Zod validation errors (thrown by userSchema.parse(...))
  if (error instanceof zod.ZodError) {
    return reply.code(400).send({
      ok: false,
      error: "Invalid request data",
      details: error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  // 3. Fastify's own errors (bad JSON body, unsupported content-type, etc.)
  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode < 500
  ) {
    return reply.code(error.statusCode).send({
      ok: false,
      error: error.message,
    });
  }

  // 4. Anything else = unexpected bug. Never leak internals.
  return reply.code(500).send({
    ok: false,
    error: "Internal server error",
  });
});
await app.listen({ port: 3000 });
// TODO: add /health route
