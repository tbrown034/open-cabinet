import { beforeEach, describe, expect, it, vi } from "vitest";

const { update, save } = vi.hoisted(() => ({ update: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ update }) }));
vi.mock("@/lib/ask/origin", () => ({ isAskOrigin: () => true }));
vi.mock("@/lib/askai-access", () => ({ requestHasAskaiAccess: () => true }));
import { POST } from "./route";

function post(body: unknown) {
  return POST(new Request("http://localhost/api/ask/feedback", {
    method: "POST", body: JSON.stringify(body),
  }));
}
beforeEach(() => {
  vi.clearAllMocks();
  update.mockReturnValue({ set: () => ({ where: () => ({ returning: save }) }) });
  save.mockResolvedValue([{ id: 7 }]);
});

describe("feedback save results", () => {
  it.each([null, [], "text", 7])("rejects non-object JSON %j", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
  it("only acknowledges an existing saved answer", async () => {
    const res = await post({ logId: 7, verdict: "right" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(save).toHaveBeenCalledOnce();
  });
  it("does not claim success when the answer no longer exists", async () => {
    save.mockResolvedValue([]);
    const res = await post({ logId: 7, verdict: "wrong" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false });
  });
  it("returns an unsuccessful response on a database failure", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    save.mockRejectedValue(new Error("database offline"));
    const res = await post({ logId: 7, verdict: "right" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
    warning.mockRestore();
  });
});
