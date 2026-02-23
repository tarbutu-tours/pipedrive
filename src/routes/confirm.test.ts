import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { confirmRoutes } from "./confirm.js";
import type { UserRecord } from "../auth/index.js";

const mockUser: UserRecord = { id: "user-1", email: "u@test.com", role: "sales_rep" };
const mockManager: UserRecord = { id: "manager-1", email: "m@test.com", role: "sales_manager" };

const mockDb = {
  actionRequest: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

const mockPipedrive = {
  createNote: vi.fn(),
  updateDealStage: vi.fn(),
};

async function buildApp(user: UserRecord) {
  const app = Fastify();
  app.addHook("preHandler", (req, _reply, done) => {
    (req as { user: UserRecord }).user = user;
    done();
  });
  await app.register(confirmRoutes, {
    db: mockDb,
    pipedrive: mockPipedrive,
  });
  return app;
}

describe("confirm endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates payload and returns 400 for invalid input", async () => {
    const app = await buildApp(mockUser);
    const res = await app.inject({
      method: "POST",
      url: "/api/actions/confirm",
      payload: { actionRequestId: "req-1", confirm: "not-bool" },
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when action request not found", async () => {
    mockDb.actionRequest.findUnique.mockResolvedValue(null);
    const app = await buildApp(mockUser);
    const res = await app.inject({
      method: "POST",
      url: "/api/actions/confirm",
      payload: { actionRequestId: "nonexistent", confirm: true },
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 when user cannot confirm this request", async () => {
    mockDb.actionRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "pending_confirmation",
      createdByUserId: "other-user",
      planJson: { actionType: "create_note", input: { dealId: 1, content: "Hi" } },
      createdBy: { id: "other-user" },
    });
    const app = await buildApp(mockUser);
    const res = await app.inject({
      method: "POST",
      url: "/api/actions/confirm",
      payload: { actionRequestId: "req-1", confirm: true },
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("cancels when confirm=false", async () => {
    mockDb.actionRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "pending_confirmation",
      createdByUserId: mockUser.id,
      planJson: { actionType: "create_note", input: { dealId: 1, content: "Hi" } },
      createdBy: { id: mockUser.id },
    });
    mockDb.actionRequest.update.mockResolvedValue({});
    const app = await buildApp(mockUser);
    const res = await app.inject({
      method: "POST",
      url: "/api/actions/confirm",
      payload: { actionRequestId: "req-1", confirm: false },
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockDb.actionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1" },
        data: { status: "cancelled" },
      })
    );
  });

  it("validates plan payload (actionType + input)", async () => {
    mockDb.actionRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "pending_confirmation",
      createdByUserId: mockUser.id,
      planJson: { actionType: "create_note", input: { dealId: -1, content: "x" } },
      createdBy: { id: mockUser.id },
    });
    const app = await buildApp(mockUser);
    const res = await app.inject({
      method: "POST",
      url: "/api/actions/confirm",
      payload: { actionRequestId: "req-1", confirm: true },
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
  });
});
