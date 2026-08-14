# 安全和数据边界

## 不随包分发的内容

- 候选人原始 JSON、简历、截图、评分证据。
- BOSS、飞书、浏览器 Cookie 和登录态。
- 飞书 Base token、table id、record id。
- OpenCLI 全局安装目录、Kimi daemon 二进制。

## BOSS 安全规则

- 只读操作默认使用 `hr-recruiting-orchestrator/scripts/kimi-boss.ps1`。
- OpenCLI 仅作为 fallback，必须通过 `opencli-boss-locked` 执行。
- 不裸跑 `opencli boss ...`，不长期附着调试会话。
- 不并发跑多个 BOSS 命令。
- OpenCLI 命令执行后立即解绑。
- 页面不断刷新时先停止循环，再执行 `opencli browser site:boss unbind`。

## Git 安全规则

- 禁止提交候选人数据、简历、导出文件、截图、日志和本地缓存。
- 禁止提交 `.env`、Cookie、Base token、API key、SSH 私钥或其他凭据。
- 推送前检查 `git status`、暂存区文件列表和敏感信息扫描结果。
- 自动同步只能普通推送到 `main`；禁止 `--force` 和 `--force-with-lease`。
- 远程有新提交、存在冲突或扫描发现敏感内容时，停止自动提交并报告。

## 触达确认

所有 BOSS 写操作都必须单独确认。确认内容至少包含候选人、动作、话术或邀约内容。

## 飞书写入规则

写入前先读字段；写失败要记录错误，不静默降级。附件字段受限时，用飞书在线文档链接兜底。
