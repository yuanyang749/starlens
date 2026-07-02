/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { assertReadOnlySelect } from "@starlens/server/server/ai/ask/agent/sql-validator";

describe("assertReadOnlySelect", () => {
  it("accepts a plain SELECT statement", () => {
    expect(() => assertReadOnlySelect("SELECT id, full_name FROM starred_repos")).not.toThrow();
  });

  it("accepts a WITH ... SELECT (CTE) statement", () => {
    expect(() =>
      assertReadOnlySelect("WITH ranked AS (SELECT id FROM starred_repos) SELECT * FROM ranked"),
    ).not.toThrow();
  });

  it("accepts and strips a single trailing semicolon", () => {
    expect(assertReadOnlySelect("SELECT 1;")).toBe("SELECT 1");
  });

  it("rejects an empty query", () => {
    expect(() => assertReadOnlySelect("   ")).toThrow(/empty/);
  });

  it("rejects statement stacking (multiple statements separated by ;)", () => {
    expect(() => assertReadOnlySelect("SELECT 1; DROP TABLE starred_repos;")).toThrow(/single SQL statement/);
  });

  it("rejects a query that doesn't start with SELECT/WITH", () => {
    expect(() => assertReadOnlySelect("UPDATE starred_repos SET is_favorite = true")).toThrow(/Only SELECT/);
  });

  for (const keyword of ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "GRANT", "TRUNCATE", "CREATE"]) {
    it(`rejects a single statement containing ${keyword} as a standalone keyword`, () => {
      expect(() => assertReadOnlySelect(`SELECT 1 ${keyword} 2`)).toThrow(/not allowed/);
    });
  }

  it("does not false-positive on identifiers that merely contain a dangerous word as a substring", () => {
    // "created_at" 包含 "create" 但不是独立单词，不应该被拦
    expect(() => assertReadOnlySelect("SELECT created_at FROM starred_repos")).not.toThrow();
  });
});
