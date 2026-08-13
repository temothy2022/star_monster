import { describe, expect, it } from "vitest";
import { checkFamilyTravelPacking } from "../src/domain/travel-packing-tips.js";

describe("family travel packing tips", () => {
  it("matches common aliases rather than requiring the exact template label", () => {
    const result = checkFamilyTravelPacking([
      { label: "美林布洛芬", quantity: 1, packed: true, expirationDate: null },
      { label: "手机数据线", quantity: 2, packed: true, expirationDate: null },
    ]);
    const attentionIds = result.groups.flatMap((group) => group.items.map((item) => item.id));
    expect(attentionIds).not.toContain("fever-medicine");
    expect(attentionIds).not.toContain("charger");
  });

  it("distinguishes missing, unpacked, out-of-stock and expired items", () => {
    const result = checkFamilyTravelPacking([
      { label: "儿童水杯", quantity: 1, packed: false, expirationDate: null },
      { label: "湿纸巾", quantity: 0, packed: false, expirationDate: null },
      { label: "布洛芬", quantity: 1, packed: true, expirationDate: "2026-01-01" },
    ], "2026-08-13");
    const items = result.groups.flatMap((group) => group.items);
    expect(items.find((item) => item.id === "child-water")?.status).toBe("UNPACKED");
    expect(items.find((item) => item.id === "wet-wipes")?.status).toBe("OUT_OF_STOCK");
    expect(items.find((item) => item.id === "fever-medicine")?.status).toBe("EXPIRED");
    expect(items.find((item) => item.id === "adult-id")?.status).toBe("NOT_LISTED");
  });
});
