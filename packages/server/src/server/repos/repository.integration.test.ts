// resolveRepoRowId 集成测试 —— 覆盖 owner/repo 全名调用 500 的根因修复
// 中文注释：不 mock DB，测试 userId（TEST_USER_ID）有 182 个真实 starred repos，
// 用 searchRepos 取一条真实存在的行作为 UUID/fullName 命中场景的 fixture。
import { beforeAll, describe, expect, it } from "vitest";
import { addRepoTag, getRepoDetail, resolveRepoRowId, searchRepos } from "./repository";

const TEST_USER_ID = "b239b58e-35d1-448b-887e-f8d033af0917";
const NON_EXISTENT_FULL_NAME = "nonexistent-user/no-such-repo";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

describeDb("resolveRepoRowId (DB integration)", () => {
  let fixtureId: string;
  let fixtureFullName: string;

  beforeAll(async () => {
    const result = await searchRepos(TEST_USER_ID, { pageSize: 1 });
    const row = result.items[0];
    if (!row) {
      throw new Error("TEST_USER_ID has no starred repos to use as a fixture.");
    }
    fixtureId = row.id;
    fixtureFullName = row.fullName;
  });

  it("resolves a real UUID to itself", async () => {
    await expect(resolveRepoRowId(TEST_USER_ID, fixtureId)).resolves.toBe(fixtureId);
  });

  it("resolves a real owner/repo fullName to its UUID", async () => {
    await expect(resolveRepoRowId(TEST_USER_ID, fixtureFullName)).resolves.toBe(fixtureId);
  });

  it("returns null (not a throw) for a nonexistent fullName", async () => {
    await expect(resolveRepoRowId(TEST_USER_ID, NON_EXISTENT_FULL_NAME)).resolves.toBeNull();
  });

  it("returns null (not a throw) for a well-formed but nonexistent UUID", async () => {
    await expect(resolveRepoRowId(TEST_USER_ID, NON_EXISTENT_UUID)).resolves.toBeNull();
  });

  // 回归验证：getRepoDetail/addRepoTag 本身的契约没变——直接传 fullName（不经过路由层的
  // resolveRepoRowId）仍然会让 Postgres 抛 uuid 语法错误。证明修复只发生在路由边界，
  // 避免将来有人误以为这些函数自己也做了 id-or-fullName 解析。
  it("getRepoDetail still rejects a fullName argument directly (route boundary owns resolution)", async () => {
    await expect(getRepoDetail(TEST_USER_ID, fixtureFullName)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/invalid input syntax for type uuid/i) }),
    });
  });

  it("addRepoTag still rejects a fullName argument directly (route boundary owns resolution)", async () => {
    await expect(addRepoTag(TEST_USER_ID, fixtureFullName, "test-tag")).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/invalid input syntax for type uuid/i) }),
    });
  });
});
