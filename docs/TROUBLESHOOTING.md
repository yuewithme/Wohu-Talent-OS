# 常见问题排查

## BOSS 页面反复刷新

本环境已确认：裸跑 `opencli boss ... --site-session persistent --keep-tab true` 这类 raw persistent keep-tab 命令会让 BOSS 页面发生真实硬重载。

定位结论不是“猜测 CDP 敏感”，而是已隔离到 OpenCLI Browser Bridge 的 `exec` / `evaluate` 页面执行路径：

- Kimi WebBridge 在页面里直接请求同一个 BOSS friend-list 接口，返回正常，`performance.timeOrigin` 不变，页面没有卸载。
- OpenCLI `browser eval` 请求同一个接口后，页面 `performance.timeOrigin` 改变，探针消失，随后出现 `/web/chat/index` 文档重新加载。
- OpenCLI 空操作 `opencli browser site:boss eval "document.title"` 也触发同样硬重载。
- 因此根因不是 BOSS API、不是候选人数据、也不是 adapter 的 `page.goto(...)`；根因是 OpenCLI Browser Bridge `exec` / `page.evaluate` 注入到 BOSS 页面后触发 BOSS 重载。

处理顺序：

1. 停止正在跑的 BOSS 自动化。
2. 执行 `opencli browser site:boss unbind`。
3. 确认浏览器里只保留一个已登录 BOSS 页面。
4. 优先改用本包内置的 Kimi BOSS adapter；必须用 OpenCLI 时，只通过 `opencli-boss-locked` 做短时、串行、可立即解绑的 fallback。
5. 不要重复裸跑 `opencli boss ... --keep-tab true`。

Kimi BOSS adapter 命令：

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\kimi-boss.ps1" chatlist --limit 1 -f object
```

看到 `stable=true` 说明命令前后 BOSS 页面 `performance.timeOrigin` 没变，没有发生硬重载。

## OpenCLI 更新后 BOSS 命令异常

OpenCLI 升级可能覆盖 BOSS adapter 补丁。执行：

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\opencli-boss-locked\scripts\patch-boss-adapter-navigation.ps1" -Check
```

若检查失败，去掉 `-Check` 重新应用补丁。

## ADAPTER_LOAD 或 Invalid or unexpected token

先做 adapter 语法检查，不要继续跑批量 BOSS 命令。优先重新安装 OpenCLI，再应用 `opencli-boss-locked` 补丁。

## 电子简历和附件简历混写

现象：BOSS 页面里的在线简历内容被写进 `附件简历文本`，或者 PDF 附件解析文本被写进 `电子简历工作经历` / `电子简历原始JSON`。

处理：

1. 停止当前同步。
2. 重新读取 Base 字段，确认 `电子简历*` 和 `附件简历*` 两组字段都存在。
3. 用 `kimi-boss.ps1 resume <uid>` 重新生成电子简历字段，只写 `电子简历*`。
4. 附件简历必须先下载到本地，PDF 用 `pdf` skill 解析，只写 `附件简历*`。
5. 评分可以综合两个来源，但 `评分依据` 或点评中要说明来源。

补字段脚本：

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\ensure-recruiting-base-schema.ps1" -BaseToken "<base_token>" -TableId "<table_id>"
```

## 飞书 Base 附件写入失败

如果出现 `MOBILE_ONLY` 或附件字段不可写，把生成的面试问题表导入为飞书 Docx，再把文档 URL 写入 Base 的链接/文本字段。附件简历文件本身要走 `+record-upload-attachment` 或保留下载链接，不要通过普通记录更新伪造附件单元格。

## PDF 依赖缺失

如果附件简历解析时报 `ModuleNotFoundError`，先安装 PDF skill 需要的 Python 包：

```powershell
python -m pip install pdfplumber pypdf reportlab
```

安装后用下面命令检查：

```powershell
python -c "import pdfplumber,pypdf,reportlab; print('ok')"
```

## Kimi WebBridge 能做什么

它适合观察当前真实浏览器页面、截图、看可见文字和诊断页面状态。当前实测还证明：Kimi 页面上下文 XHR 读取 BOSS friend-list 不触发硬重载，所以本包已内置 `hr-recruiting-orchestrator\scripts\kimi-boss.ps1` 作为招聘端稳定采集主路径；OpenCLI locked wrapper 保留为受控 fallback。

全量检查：

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\test-kimi-boss-adapter.ps1" -RequireCandidate
```
