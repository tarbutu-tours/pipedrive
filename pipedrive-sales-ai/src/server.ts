import "./load-env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dbUrl = process.env.DATABASE_URL ?? "";

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { createDb } from "./db/index.js";
import { createPipedriveClient, createStubPipedriveClient } from "./pipedrive/client.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes, verifySession, ensureDefaultUser } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { confirmRoutes } from "./routes/confirm.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { uiRoutes } from "./routes/ui.js";
import type { UserRecord } from "./auth/index.js";

const logger = {
  level: config.nodeEnv === "development" ? "debug" : (process.env.LOG_LEVEL ?? "info"),
  transport:
    config.nodeEnv === "development"
      ? { target: "pino-pretty", options: { translateTime: "SYS:standard" } }
      : undefined,
};

const fastify = Fastify({ logger });

const db = createDb(fastify.log as import("pino").Logger);
const pipedrive = config.pipedrive.apiToken
  ? createPipedriveClient({
      apiToken: config.pipedrive.apiToken,
      domain: config.pipedrive.domain,
    })
  : createStubPipedriveClient();

async function getCurrentUser(
  req: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply
): Promise<UserRecord | null> {
  return verifySession(req, reply, db);
}

async function requireAuth(
  req: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply
): Promise<void> {
  const user = await getCurrentUser(req, reply);
  if (!user) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  (req as { user?: UserRecord }).user = user;
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>כניסה</title>
<style>body{font-family:Segoe UI,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1d23;color:#e4e6eb;}
.card{background:#25282e;padding:2rem;border-radius:12px;max-width:380px;text-align:center;}
.enter-link{display:inline-block;padding:1rem 1.5rem;background:#0b65c2;color:#fff;text-decoration:none;border-radius:8px;margin-top:0.5rem;}
.links{margin-top:1.5rem;font-size:0.9rem;} .links a{color:#6ea8fe;}</style></head>
<body><div class="card"><h1>Pipedrive Sales AI</h1><p>לחץ כדי להיכנס:</p>
<a href="/auth/enter" class="enter-link">כניסה לאפליקציה</a>
<div class="links"><a href="/register">הרשמה</a> | <a href="/chat">צ'אט</a></div></div></body></html>`;

async function build() {
  await fastify.register(cookie, { secret: config.sessionSecret });
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  fastify.get("/", (_req, reply) => reply.redirect("/login", 302));
  fastify.get("/login", (_req, reply) => reply.type("text/html").send(LOGIN_HTML));

  fastify.addHook("preHandler", async (req, reply) => {
    (req as { requestId?: string }).requestId = (req.headers["x-request-id"] as string) ?? crypto.randomUUID();
  });

  await fastify.register(healthRoutes, { prefix: "/", db });
  await fastify.register(authRoutes, { prefix: "/", db });

  await fastify.register(async (instance) => {
    instance.addHook("preHandler", requireAuth);
    await instance.register(chatRoutes, { db, pipedrive });
  }, { prefix: "/" });

  await fastify.register(async (instance) => {
    instance.addHook("preHandler", requireAuth);
    await instance.register(confirmRoutes, { db, pipedrive });
  }, { prefix: "/" });

  await fastify.register(webhookRoutes, { prefix: "/", db });
  await fastify.register(uiRoutes, {
    prefix: "/",
    getCurrentUser: async (r: import("fastify").FastifyRequest, re: import("fastify").FastifyReply) =>
      getCurrentUser(r, re),
  });

  fastify.decorate("getCurrentUser", getCurrentUser);

  const chatRateLimit = { max: config.rateLimitChat, timeWindow: "1 minute" };
  const confirmRateLimit = { max: config.rateLimitConfirm, timeWindow: "1 minute" };

  fastify.addHook("onRoute", (opts) => {
    if (opts.url === "/api/chat/message") {
      (opts as { config?: { rateLimit?: unknown } }).config = { rateLimit: chatRateLimit };
    }
    if (opts.url === "/api/actions/confirm") {
      (opts as { config?: { rateLimit?: unknown } }).config = { rateLimit: confirmRateLimit };
    }
  });

  if (process.env.NODE_ENV !== "production") {
    fastify.get("/api/debug/pipedrive", async (_req, reply) => {
      try {
        const info = await pipedrive.fetchDealsRaw();
        return reply.send(info);
      } catch (e) {
        return reply.status(500).send({ error: String(e) });
      }
    });
  }

  return fastify;
}

build()
  .then(async (app) => {
    if (process.env.NODE_ENV !== "production" && dbUrl.startsWith("file:")) {
      try {
        fastify.log.info("Running migrate + seed (dev with SQLite)...");
        execSync("npx prisma migrate deploy", { cwd: projectRoot, stdio: "pipe", env: process.env });
        execSync("npx prisma db seed", { cwd: projectRoot, stdio: "pipe", env: process.env });
      } catch (e) {
        fastify.log.warn(e, "migrate/seed at startup failed (continuing anyway)");
      }
      const user = await ensureDefaultUser(db, app.log);
      if (user) {
        fastify.log.info("Default user ready for /auth/enter");
      } else {
        fastify.log.warn("Could not ensure default user");
      }
    }
    return app.listen({ port: config.port, host: "0.0.0.0" });
  })
  .then((addr) => {
    fastify.log.info({ addr }, "Server listening");
  })
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
