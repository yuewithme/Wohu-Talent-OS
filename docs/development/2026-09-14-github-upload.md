# 上传 WOHU-Talent 至 GitHub

## 任务目标

按用户要求，使用现有 SSH 连接，将本地插件及统一同步服务上传至 GitHub 的 WOHU-Talent 仓库，保留已有 Git 历史。

## 实施计划

1. 确认 GitHub SSH 身份、目标仓库及远端分支状态。
2. 检查待推送历史，确保密钥、简历附件、本地配置和运行数据未被跟踪。
3. 按用户补充确认，将远端旧 main 保存至备份分支，再以本地已验证项目作为 main；更新时核对远端原提交，保留功能分支和基线标签。
4. 核对 GitHub 上的分支、提交和关键项目文件。

## 完成结果与验证

上传已完成。目标仓库为 https://github.com/yuewithme/Wohu-Talent-OS，默认分支保持 main；本地当前分支切换为 main 并跟踪 origin/main。

- GitHub SSH 认证成功，身份为 yuewithme。
- 已扫描本地现有提交历史中的 66 个文件对象，未发现实际应用密钥、同步凭证、私钥、简历附件或数据库文件；本地 .env、.local、server/data 和生成安装包均已忽略。
- 远端旧 main 的完整历史已保存至 archive/main-before-resume-sync-20260914，核对备份头为 e996a417676b1e9ee429fead5b350b544b9832ec。
- 使用明确旧提交的 force-with-lease 将当前项目推送为新 main，代码提交为 e08dd03；功能分支 feat/boss-resume-feishu-sync 与原有基线标签 v0.2.1 已同步。
- GitHub 默认分支核验为 main，远端包含插件入口、消息采集、飞书服务和 Docker / HTTPS 配置；目录检查未发现 .env、.local、数据库、附件或生成安装包。
- 本任务只更换仓库主分支并上传项目，未修改运行代码，因此未重复运行已通过的构建和测试。公网 443 / HTTPS 的部署状态仍以简历同步开发日志为准。
