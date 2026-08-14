# 交接清单

## 给同事前

- 优先提供仓库地址或正式 Release；如需离线交付，再提供压缩包。
- 不发本机测试数据、候选人原始文件和任何登录凭据。
- 告知需要自己登录 BOSS、飞书和 Kimi WebBridge 浏览器扩展。
- 告知 BOSS 写操作必须人工确认。

## 同事安装后

1. 解压压缩包。
2. 执行 `install.ps1`。
3. 执行 `verify.ps1`。
4. 安装或更新 OpenCLI、lark-cli、Kimi WebBridge。
5. 在 Codex 中使用 `hr-recruiting-orchestrator` 开始招聘流程。

## 第一次跑真实岗位

- 先读飞书 Base 字段；已有 Base 可用 `ensure-recruiting-base-schema.ps1` 补齐 `电子简历*` 和 `附件简历*` 字段。
- 先跑 BOSS 只读命令，优先用 Kimi BOSS adapter。
- 小批量同步 1 到 3 个候选人。
- 确认电子简历字段和附件简历字段没有混写，再确认评分规则。
- 字段和评分规则没问题后再扩大范围。
