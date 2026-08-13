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

  it("matches real-world aliases without broad false positives", () => {
    const result = checkFamilyTravelPacking([
      { label: "儿童泰诺", quantity: 1, packed: true, expirationDate: null },
      { label: "泰诺-成人", quantity: 1, packed: true, expirationDate: null },
      { label: "西地利嗪滴剂", quantity: 1, packed: true, expirationDate: null },
      { label: "奥司他韦", quantity: 1, packed: true, expirationDate: null },
      { label: "儿童水画册", quantity: 1, packed: false, expirationDate: null },
      { label: "旅行枕头", quantity: 1, packed: true, expirationDate: null },
      { label: "瓶装奶", quantity: 5, packed: false, expirationDate: null },
      { label: "伤口喷膜", quantity: 1, packed: true, expirationDate: null },
      { label: "酒精消毒喷雾", quantity: 1, packed: false, expirationDate: null },
      { label: "手机防水袋", quantity: 2, packed: true, expirationDate: null },
      { label: "联系电话随身卡", quantity: 1, packed: true, expirationDate: null },
    ]);
    const items = result.groups.flatMap((group) => group.items);
    expect(items.find((item) => item.id === "fever-medicine")).toBeUndefined();
    expect(items.find((item) => item.id === "allergy-medicine")).toBeUndefined();
    expect(items.find((item) => item.id === "prescription")).toBeUndefined();
    expect(items.find((item) => item.id === "comfort-item")).toBeUndefined();
    expect(items.find((item) => item.id === "bandages")).toBeUndefined();
    expect(items.find((item) => item.id === "snacks")?.status).toBe("UNPACKED");
    expect(items.find((item) => item.id === "sanitizer")?.status).toBe("UNPACKED");
    expect(items.find((item) => item.id === "phone")?.status).toBe("NOT_LISTED");
  });

  it("prefers a usable unpacked match over an expired duplicate", () => {
    const result = checkFamilyTravelPacking([
      { label: "儿童退烧药旧盒", quantity: 1, packed: false, expirationDate: "2026-01-01" },
      { label: "儿童泰诺", quantity: 1, packed: false, expirationDate: "2027-01-01" },
    ], "2026-08-13");
    const item = result.groups.flatMap((group) => group.items).find((entry) => entry.id === "fever-medicine");
    expect(item?.status).toBe("UNPACKED");
  });
});
