// vitest 全局 setup —— 加载项目根目录的 .env 文件，供集成测试使用 DATABASE_URL / SYSTEM_AI_* 等变量。
// 中文注释：vitest 默认不加载 .env，纯函数单测不需要这些变量也不受影响。
import { config } from "dotenv";

config({ path: "../../.env" });
