import { createHmac } from "node:crypto";
import { authenticate, createUser, resetPassword } from "../auth/index.js";
export async function ensureDefaultUser(db, log) {
    try {
        let user = await db.user.findUnique({
            where: { email: DEFAULT_EMAIL },
            select: { id: true, email: true, role: true },
        });
        if (user) {
            const updated = await resetPassword(db, DEFAULT_EMAIL, DEFAULT_PASSWORD);
            return updated ?? user;
        }
        const all = await db.user.findMany({ select: { id: true, email: true, role: true } });
        const match = all.find((u) => u.email.toLowerCase() === DEFAULT_EMAIL);
        if (match) {
            const updated = await resetPassword(db, DEFAULT_EMAIL, DEFAULT_PASSWORD);
            return updated;
        }
        try {
            return await createUser(db, DEFAULT_EMAIL, DEFAULT_PASSWORD, "admin");
        }
        catch (e) {
            log.warn(e, "ensureDefaultUser createUser failed");
            const again = await db.user.findMany({ select: { id: true, email: true, role: true } });
            const m = again.find((u) => u.email.toLowerCase() === DEFAULT_EMAIL);
            if (m) {
                const u = await resetPassword(db, DEFAULT_EMAIL, DEFAULT_PASSWORD);
                return u;
            }
            return null;
        }
    }
    catch (e) {
        log.warn(e, "ensureDefaultUser error");
        return null;
    }
}
import { z } from "zod";
const DEFAULT_EMAIL = "admin@local.dev";
const DEFAULT_PASSWORD = "Admin123!";
const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const registerBody = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(["admin", "sales_manager", "sales_rep", "viewer"]).optional(),
});
export async function authRoutes(fastify, deps) {
    fastify.post("/api/auth/login", async (req, reply) => {
        const isDev = process.env.NODE_ENV !== "production";
        try {
            const body = req.body != null && typeof req.body === "object" ? req.body : {};
            const parsed = loginBody.safeParse(body);
            if (!parsed.success) {
                return reply.code(400).send({ error: "Invalid email or password" });
            }
            const { email, password } = parsed.data;
            let result;
            if (email === DEFAULT_EMAIL && password === DEFAULT_PASSWORD) {
                const defaultUser = await ensureDefaultUser(deps.db, fastify.log);
                result = defaultUser ? { user: defaultUser } : { error: "Invalid email or password" };
            }
            else {
                try {
                    result = await authenticate(deps.db, email, password);
                }
                catch (e) {
                    fastify.log.warn(e, "authenticate threw");
                    return reply.code(500).send({
                        error: "Internal Server Error",
                        ...(isDev && { detail: e instanceof Error ? e.message : String(e) }),
                    });
                }
            }
            if ("error" in result) {
                return reply.code(401).send({ error: result.error });
            }
            try {
                setSession(reply, result.user);
            }
            catch (e) {
                fastify.log.warn(e, "setSession threw");
                return reply.code(500).send({
                    error: "Internal Server Error",
                    ...(isDev && { detail: e instanceof Error ? e.message : String(e) }),
                });
            }
            return reply.send({ user: result.user });
        }
        catch (e) {
            fastify.log.error(e, "login error");
            return reply.code(500).send({
                error: "Internal Server Error",
                ...(isDev && { detail: e instanceof Error ? e.message : String(e) }),
            });
        }
    });
    fastify.post("/api/auth/register", async (req, reply) => {
        const parsed = registerBody.safeParse(req.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: "Invalid input" });
        }
        const existing = await deps.db.user.findUnique({
            where: { email: parsed.data.email.trim().toLowerCase() },
        });
        if (existing) {
            return reply.code(409).send({ error: "Email already registered" });
        }
        const user = await createUser(deps.db, parsed.data.email, parsed.data.password, parsed.data.role ?? "sales_rep");
        setSession(reply, user);
        return reply.send({ user });
    });
    fastify.post("/api/auth/logout", async (_req, reply) => {
        return reply.clearCookie("session").send({ ok: true });
    });
    // כניסה ישירה בלי אימייל/סיסמה – רק בסביבת פיתוח
    fastify.get("/auth/enter", async (_req, reply) => {
        if (process.env.NODE_ENV === "production") {
            return reply.code(404).send("Not found");
        }
        try {
            const user = await ensureDefaultUser(deps.db, fastify.log);
            if (!user) {
                fastify.log.warn("ensureDefaultUser returned null");
                return reply.redirect("/login?error=db", 302);
            }
            setSession(reply, user);
            return reply.redirect("/chat", 302);
        }
        catch (e) {
            fastify.log.error(e, "auth/enter error");
            return reply.redirect("/login?error=db", 302);
        }
    });
}
const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
function setSession(reply, user) {
    const payload = JSON.stringify({ userId: user.id });
    const secret = process.env.SESSION_SECRET ?? "dev-secret";
    const signature = simpleSign(payload, secret);
    const value = Buffer.from(JSON.stringify({ payload, sig: signature })).toString("base64url");
    const opts = {
        path: "/",
        httpOnly: true,
        maxAge: SESSION_MAX_AGE,
        sameSite: "lax",
    };
    if (process.env.NODE_ENV === "production") {
        opts.secure = true;
    }
    reply.setCookie(SESSION_COOKIE, value, opts);
}
function simpleSign(payload, secret) {
    const hmac = createHmac("sha256", secret.slice(0, 32).padEnd(32, "0"));
    hmac.update(payload, "utf8");
    return hmac.digest("base64url");
}
export async function verifySession(req, reply, db) {
    const cookie = req.cookies?.session;
    if (!cookie)
        return null;
    try {
        const raw = Buffer.from(cookie, "base64url").toString("utf8");
        const { payload, sig } = JSON.parse(raw);
        const secret = process.env.SESSION_SECRET ?? "dev-secret";
        const expected = simpleSign(payload, secret);
        if (sig !== expected)
            return null;
        const { userId } = JSON.parse(payload);
        const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
        return user;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=auth.js.map