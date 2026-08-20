import { describe, expect, it } from "vitest";
import {
  databaseEnvironment,
  SYSTEM_OPERATION_DEFINITIONS,
} from "../src/services/system-operations-service.js";

describe("system operations", () => {
  it("exposes only the reviewed operation allowlist", () => {
    expect(Object.keys(SYSTEM_OPERATION_DEFINITIONS)).toEqual([
      "RECONCILE_DAILY_TASKS",
      "CLEAN_EXPIRED_DATA",
      "GENERATE_WEEKLY_REPORTS",
    ]);
    expect(
      Object.values(SYSTEM_OPERATION_DEFINITIONS).every(
        (operation) => operation.confirmation.length >= 6,
      ),
    ).toBe(true);
  });

  it("converts a Prisma PostgreSQL URL into pg_dump environment variables", () => {
    expect(
      databaseEnvironment(
        "postgresql://star%20user:p%40ss@127.0.0.1:5433/star_monsters?schema=public&sslmode=require",
      ),
    ).toEqual({
      PGHOST: "127.0.0.1",
      PGPORT: "5433",
      PGUSER: "star user",
      PGPASSWORD: "p@ss",
      PGDATABASE: "star_monsters",
      PGSSLMODE: "require",
    });
  });

  it("rejects non-PostgreSQL backup URLs", () => {
    expect(() => databaseEnvironment("mysql://user:pass@localhost/database")).toThrow(
      "仅支持 PostgreSQL 数据库备份",
    );
  });
});
