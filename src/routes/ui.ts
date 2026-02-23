import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { readFile } from "fs/promises";
import { join } from "path";
import type { UserRecord } from "../auth/index.js";

function getUiPath(): string {
  const cwd = process.cwd();
  const fromSrc = join(cwd, "src", "ui");
  const fromDist = join(cwd, "dist", "ui");
  return fromSrc;
}

export async function uiRoutes(
  fastify: FastifyInstance,
  deps: { getCurrentUser: (req: FastifyRequest, reply: FastifyReply) => Promise<UserRecord | null> }
) {
  fastify.get("/chat", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await deps.getCurrentUser(req, reply);
      const html = await getChatPage(user != null);
      return reply.type("text/html").send(html);
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).type("text/html").send(
        `<html><body dir="rtl"><h1>שגיאה</h1><p>${e instanceof Error ? e.message : String(e)}</p><p><a href="/login">לדף התחברות</a></p></body></html>`
      );
    }
  });

  fastify.get("/login", async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const html = await getLoginPage();
      return reply.code(200).type("text/html").send(html);
    } catch (e) {
      fastify.log.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(500).type("text/html").send(
        `<html><body dir="rtl"><h1>שגיאה בטעינת דף</h1><p>${msg}</p></body></html>`
      );
    }
  });

  fastify.get("/register", async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const html = await getRegisterPage();
      return reply.code(200).type("text/html").send(html);
    } catch (e) {
      fastify.log.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(500).type("text/html").send(
        `<html><body dir="rtl"><h1>שגיאה בטעינת דף</h1><p>${msg}</p></body></html>`
      );
    }
  });
}

async function getLoginPage(): Promise<string> {
  const base = getUiPath();
  const html = await readFile(join(base, "login.html"), "utf8");
  return html;
}

async function getRegisterPage(): Promise<string> {
  const base = getUiPath();
  const html = await readFile(join(base, "register.html"), "utf8");
  return html;
}

async function getChatPage(authenticated: boolean): Promise<string> {
  const base = getUiPath();
  let html = await readFile(join(base, "chat.html"), "utf8");
  if (!authenticated) {
    html = html.replace(
      "<!-- REDIRECT -->",
      "<script>window.location.href='/login';</script>"
    );
  } else {
    html = html.replace("<!-- REDIRECT -->", "");
  }
  return html;
}
