import crypto from "crypto";

export function generateUUID(request, reply) {
  request.uuid = crypto.randomUUID();
}
