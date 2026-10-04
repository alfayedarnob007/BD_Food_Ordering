import { describe, expect, it, vi } from "vitest";
import { assertOk, extractId, guard, impactedCount, listAll, readPage } from "./gateway";

describe("assertOk", () => {
  it("throws the gateway's messages when a 200 response carries errors", () => {
    expect(() => assertOk({ data: null, errors: [{ message: "Field 'x' is not defined" }, { message: "second" }] })).toThrow("Field 'x' is not defined; second");
  });
  it("falls back to a generic message when errors have none", () => {
    expect(() => assertOk({ errors: [{}] })).toThrow("The data gateway returned an error.");
  });
  it("accepts clean, empty and missing errors", () => {
    expect(() => assertOk({ data: {} })).not.toThrow();
    expect(() => assertOk({ errors: [] })).not.toThrow();
    expect(() => assertOk({ errors: null })).not.toThrow();
    expect(() => assertOk(undefined)).not.toThrow();
  });
});

describe("guard", () => {
  it("makes every collection call reject on gateway errors and passes good responses through", async () => {
    const collection = guard({
      create: async () => ({ errors: [{ message: "denied" }] }),
      list: async () => ({ data: { getThings: { items: [1] } } })
    });
    await expect(collection.create()).rejects.toThrow("denied");
    await expect(collection.list()).resolves.toEqual({ data: { getThings: { items: [1] } } });
  });
  it("forwards arguments", async () => {
    const update = vi.fn(async (id: string, payload: object) => ({ data: { id, payload } }));
    await guard({ update }).update("abc", { status: "ready" });
    expect(update).toHaveBeenCalledWith("abc", { status: "ready" });
  });
});

describe("extractId", () => {
  it("finds the id where the generated mutation put it", () => {
    expect(extractId({ data: { insertOrder: { acknowledged: true, itemId: "i-1" } } })).toBe("i-1");
    expect(extractId({ ItemId: "i-2" })).toBe("i-2");
  });
  it("returns undefined when there is none", () => {
    expect(extractId({ data: { insertOrder: { acknowledged: true } } })).toBeUndefined();
    expect(extractId(undefined)).toBeUndefined();
    expect(extractId("text")).toBeUndefined();
  });
});

describe("readPage", () => {
  it("reads items and hasNextPage from the operation's result", () => {
    expect(readPage({ data: { getOrders: { hasNextPage: true, items: [{ ItemId: "1" }] } } })).toEqual({ hasNext: true, items: [{ ItemId: "1" }] });
  });
  it("treats anything unexpected as an empty last page", () => {
    expect(readPage({ data: { getOrders: null } })).toEqual({ hasNext: false, items: [] });
    expect(readPage(undefined)).toEqual({ hasNext: false, items: [] });
    expect(readPage({ data: { getOrders: { items: [1] } } }).hasNext).toBe(false);
  });
});

describe("listAll", () => {
  const page = (items: number[], hasNextPage: boolean) => ({ data: { getThings: { hasNextPage, items } } });

  it("follows hasNextPage across pages and forwards the filter", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce(page([1, 2], true))
      .mockResolvedValueOnce(page([3], false));
    await expect(listAll<number>(list, { restaurantId: "r" })).resolves.toEqual([1, 2, 3]);
    expect(list).toHaveBeenNthCalledWith(1, { filter: { restaurantId: "r" }, pageNo: 1, pageSize: 100 });
    expect(list).toHaveBeenNthCalledWith(2, { filter: { restaurantId: "r" }, pageNo: 2, pageSize: 100 });
  });
  it("does not rely on the page being full (a server may cap the page size)", async () => {
    const list = vi.fn().mockResolvedValueOnce(page([1], true)).mockResolvedValueOnce(page([2], false));
    await expect(listAll<number>(list)).resolves.toEqual([1, 2]);
  });
  it("stops on an empty page even if the server still says there is more", async () => {
    const list = vi.fn().mockResolvedValue(page([], true));
    await expect(listAll<number>(list)).resolves.toEqual([]);
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("is bounded so a misbehaving server cannot loop forever", async () => {
    const list = vi.fn().mockResolvedValue(page([1], true));
    expect((await listAll<number>(list)).length).toBe(100);
  });
});

describe("impactedCount", () => {
  it("finds totalImpactedData wherever the mutation put it", () => {
    expect(impactedCount({ data: { updateOrder: { acknowledged: true, totalImpactedData: 1 } } })).toBe(1);
    expect(impactedCount({ data: { updateOrder: { totalImpactedData: 0 } } })).toBe(0);
  });
  it("is undefined when the response does not say", () => {
    expect(impactedCount({ data: { updateOrder: { acknowledged: true } } })).toBeUndefined();
    expect(impactedCount(undefined)).toBeUndefined();
  });
});
