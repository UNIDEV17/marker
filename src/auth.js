import crypto from "crypto";
import { pool } from "./db.js";

export async function requireAuth(req, reply) {
  // 1. Read cookie
  const sessionId = req.cookies.sessionId;

  if (!sessionId) {
    return reply.status(401).send({ error: "Unauthorized: no session" });
  }

  // 2. Hash it
  const tokenHash = crypto.createHash("sha256").update(sessionId).digest("hex");

  // 3. Look up in DB
  const { rows } = await pool.query(
    `SELECT s.*, u.id as user_id, u.email, u.username 
     FROM sessions s 
     JOIN users u ON s.user_id = u.id 
     WHERE s.token_hash = $1`,
    [tokenHash],
  );

  const session = rows[0];

  if (!session) {
    return reply.status(401).send({ error: "Unauthorized: invalid session" });
  }

  // 4. Check expiry
  if (new Date() > new Date(session.expires_at)) {
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    reply.clearCookie("sessionId", { path: "/" });
    return reply.status(401).send({ error: "Unauthorized: session expired" });
  }

  // 5. Attach user
  req.user = {
    id: session.user_id,
    email: session.email,
    username: session.username,
  };
}
