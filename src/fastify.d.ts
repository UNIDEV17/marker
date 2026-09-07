import "fastify";

interface AuthUser {
  id: number;
  username: string;
  email: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
    uuid?: string;
  }
}
