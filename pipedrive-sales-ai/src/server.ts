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
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>התחברות</title>
<style>body{font-family:'Ploni',Segoe UI,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1d23;color:#e4e6eb;}
.card{background:#25282e;padding:2rem;border-radius:12px;max-width:380px;width:100%;box-shadow:0 8px 24px rgba(0,0,0,.3);}
.card h1{margin:0 0 1.5rem;font-size:1.5rem;text-align:center;}
.card label{display:block;margin-bottom:0.35rem;font-size:0.9rem;}
.card input{width:100%;padding:0.75rem;border:1px solid #444;border-radius:8px;background:#1a1d23;color:#e4e6eb;margin-bottom:1rem;box-sizing:border-box;}
.card button{width:100%;padding:1rem;background:#0b65c2;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer;}
.card button:hover{background:#0d6fd8;}
.card .error{color:#f87171;font-size:0.9rem;margin-top:0.5rem;}
.card .links{margin-top:1.5rem;font-size:0.9rem;text-align:center;}
.card .links a{color:#6ea8fe;text-decoration:none;}</style></head>
<body><div class="card"><h1>Pipedrive Sales AI</h1><p style="text-align:center;margin-bottom:1rem;">התחברות לאפליקציה</p>
<form id="loginForm"><label for="email">אימייל</label><input type="email" id="email" name="email" required placeholder="your@email.com" autocomplete="email">
<label for="password">סיסמה</label><input type="password" id="password" name="password" required placeholder="••••••••" autocomplete="current-password">
<div id="loginError" class="error"></div><button type="submit">כניסה</button></form>
<div class="links"><a href="/register">הרשמה (משתמש חדש)</a></div></div>
<script>document.getElementById("loginForm").onsubmit=async function(e){e.preventDefault();var err=document.getElementById("loginError"),btn=e.target.querySelector("button[type=submit]");err.textContent="";btn.disabled=true;try{var r=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:document.getElementById("email").value.trim(),password:document.getElementById("password").value}),credentials:"include"});var d=await r.json().catch(function(){});if(!r.ok){err.textContent=d.error||"אימייל או סיסמה שגויים";btn.disabled=false;return;}window.location.href="/chat";}catch(x){err.textContent="שגיאת רשת. נסה שוב.";btn.disabled=false;}}</script></body></html>`;

async function build() {
  // Handle GET / and GET /login in onRequest so they NEVER hit 404 (runs before router)
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.method !== "GET") return;
    let raw = (request.url ?? "").trim();
    // Some proxies pass full URL; normalize to path only
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        raw = new URL(raw).pathname;
      } catch {
        raw = raw.split("?")[0];
      }
    }
    const pathname = raw.split("?")[0].replace(/\/+$/, "") || "/";
    if (pathname === "/" || pathname === "/login" || pathname.startsWith("/login/")) {
      return reply.type("text/html").send(LOGIN_HTML);
    }
  });

  await fastify.register(cookie, { secret: config.sessionSecret });
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // Routes for / and /login (backup; onRequest above handles them first)
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

  // Fallback: if / or /login ever hit 404 (e.g. proxy path), still serve login
  fastify.setNotFoundHandler((request, reply) => {
    let raw = (request.url ?? "").split("?")[0].trim();
    if (raw.startsWith("http")) try { raw = new URL(raw).pathname; } catch { /* ignore */ }
    const pathname = raw.replace(/\/+$/, "") || "/";
    if (request.method === "GET" && (pathname === "/" || pathname === "/login" || pathname.startsWith("/login/"))) {
      return reply.type("text/html").send(LOGIN_HTML);
    }
    return reply.status(404).send({ error: "Not Found" });
  });

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
