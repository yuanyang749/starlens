// CLI 错误类型：携带 exitCode 与额外上下文（status、apiCode 等），
// 便于上层渲染与重试逻辑判断。
export class CliError extends Error {
  constructor(message, exitCode = 1, details = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    // 例如 { status: 503, apiCode: "provider_timeout", transient: true }
    Object.assign(this, details);
  }
}
