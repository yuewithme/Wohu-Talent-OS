# 150 服务器自托管 Runner 与部署流水线

## 任务目标

为 `yuewithme/Wohu-Talent-OS` 配置 GitHub Actions 自托管 Runner，并在 `main` 分支的 `web/` 代码更新后自动构建静态站点、部署到 `150.158.52.233` 云服务器。

## 实施计划

1. 检查服务器操作系统、已有 Web 服务、端口和部署目录，避免覆盖现有应用。
2. 在 GitHub 仓库生成短期注册令牌，在服务器上以独立目录和 systemd 服务安装自托管 Runner。
3. 新增服务器部署 workflow：通过 Docker 构建 `web/out`，先验证候选容器，再更新监听 18083 端口的正式容器。
4. 配置容器内 Nginx 静态站点、健康检查和失败回滚，提交并推送 workflow。
5. 触发一次流水线，验证 Runner 在线、任务成功以及服务器 HTTP 响应。

## 完成结果

- 在 `150.158.52.233` 的 `/opt/actions-runner/wohu-talent-os` 安装 GitHub Actions Runner `2.337.0`，注册名为 `wohu-talent-os-150`，专用标签为 `wohu-production`。
- Runner 由 systemd 服务托管，并设置为开机自启；`ubuntu` 用户已具备 Docker 运行权限。
- 新增 `.github/workflows/deploy-server.yml`，在 `main` 分支的 `web/` 内容变更或手动触发时，由专用 Runner 构建和部署。
- 新增多阶段 Docker 镜像：Node.js 构建静态站点，Nginx 在容器内监听 18083；正式容器映射服务器公网端口 18083，并使用 `unless-stopped` 重启策略。
- 部署前通过服务器回环端口 18084 验证候选容器；正式切换后再次检查 18083，失败时恢复上一镜像。
- 保留原 GitHub Pages 流水线，并将静态导出的 base path 改为按构建目标配置，服务器部署使用根路径。

## 验证情况

- GitHub Actions 运行 `34075598336` 成功，checkout、镜像构建、候选验证和正式部署步骤均通过。
- GitHub API 显示 Runner 状态为 `online`，systemd 状态为 `enabled` 和 `active`。
- `wohu-talent-os` 容器状态为 `running/healthy`，运行镜像对应提交 `9173072dd7b01a653e078a7f94ebdebc158c3b36`。
- 服务器本机和公网访问 `http://150.158.52.233:18083/` 均返回 HTTP 200。
- 最终差异通过 `git diff --check` 检查。
