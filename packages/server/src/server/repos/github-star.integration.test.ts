// star_repo / unstar_repo 集成测试 —— 只覆盖真实 DB 查询路径。
// 中文注释：不在这里对 GitHub 发起真实的 star/unstar 请求——测试账号的 token 目前
// 还是旧 scope（无 public_repo，见 packages/server/src/auth.ts 的改动说明），而且对
// 真实 GitHub 状态做写操作不适合放在自动化测试里反复跑。这里只验证"仓库不在本地
// 收藏列表"这个分支——它在调用 GitHub API 之前就会短路返回，不产生任何外部副作用。
import { describe, expect, it } from "vitest";
import { GithubStarError, unstarRepoOnGithubForUser } from "./github-star";

const TEST_USER_ID = "b239b58e-35d1-448b-887e-f8d033af0917";
const NON_EXISTENT_FULL_NAME = "nonexistent-user/no-such-repo";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

describeDb("unstarRepoOnGithubForUser (DB integration, no external GitHub calls)", () => {
  it("throws not_found for a repo that isn't in the user's starred collection", async () => {
    await expect(unstarRepoOnGithubForUser(TEST_USER_ID, NON_EXISTENT_FULL_NAME)).rejects.toMatchObject({
      code: "not_found" satisfies GithubStarError["code"],
    });
  });
});
