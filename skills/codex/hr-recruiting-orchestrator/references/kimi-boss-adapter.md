# Kimi BOSS recruiter adapter

This skill includes a Kimi WebBridge-backed BOSS recruiter adapter.

Entrypoint:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\kimi-boss.ps1" <command> [args...] -f json
```

The adapter controls the user's existing logged-in BOSS tab through Kimi WebBridge. It does not use OpenCLI Browser Bridge `exec` / `page.evaluate`, so it avoids the reload path isolated in the benchmark.

## Command coverage

Read commands:

- `status` — verify current BOSS tab URL, title, and `performance.timeOrigin`.
- `chatlist --limit N --page P --job-id ID` — recruiter-side chat list.
- `chatmsg <uid> --page P` — recruiter-side chat history.
- `resume <uid>` — read the BOSS **电子简历**. It uses the right-side panel for summary fields when the candidate is visible, then uses a reusable hidden BOSS online-resume iframe to read the full electronic resume detail, including `geekProjExpList` project experience.
- `recommend --limit N` — recommended / new greeting candidates.
- `joblist` — published job list.
- `stats --job-id ID` — job-level chat statistics.
- `label-list` — candidate label definitions.

Write-capable commands:

- `send <uid> <text>`
- `greet <uid> --text "..."`
- `batchgreet --limit N --text "..."`
- `invite <uid> --time "2026-06-01 14:00" --address "..." --contact "..."`
- `mark <uid> <label> [--remove]`
- `exchange <uid> --type phone|wechat`

All write-capable commands are dry-run by default. They only execute when `--confirm` is present, and the orchestrator must still obtain explicit user approval in the current turn before adding `--confirm`.

## Output formats

- `-f json` — returns row array.
- `-f object` — returns `{ ok, command, tab, stable, before, after, dryRun, rows }`.
- `-f table` — human table output.

Use `-f object` in tests because it exposes the `stable` flag. `stable=true` means the BOSS page `performance.timeOrigin` did not change across the command.

## Electronic vs attachment resume

`resume <uid>` returns the BOSS online / electronic resume only. It intentionally does not populate attachment resume fields.

Important implementation detail:

- Do not rely only on the compact right-side chat panel. That panel often omits project experience.
- Full project experience comes from the online-resume iframe `IFRAME_DONE.abstractData.geekProjExpList`.
- Reuse one hidden iframe per BOSS page. Creating a new WebAssembly resume iframe for every candidate can exhaust Chrome memory and cause project fields to fall back to empty panel data.
- If a candidate truly has no project list in `geekProjExpList`, write `(电子简历未填写项目经历)` rather than leaving the Base cell blank.

The row includes both compatibility keys and Base-ready Chinese keys:

- compatibility keys: `name`, `gender`, `age`, `experience`, `degree`, `active_time`, `work_history`, `education`, `job_chatting`, `expect`
- Base-ready keys: `电子简历姓名`, `电子简历性别`, `电子简历年龄`, `电子简历学历`, `电子简历工作年限`, `电子简历活跃时间`, `电子简历应聘职位`, `电子简历期望职位`, `电子简历期望城市`, `电子简历期望薪资`, `电子简历当前/最近公司`, `电子简历当前/最近职位`, `电子简历工作经历`, `电子简历教育经历`, `电子简历项目经历`, `电子简历技能`, `电子简历原始JSON`, `简历来源说明`

Attachment resumes must be handled separately:

1. download the PDF / Word attachment;
2. parse PDFs with the Codex `pdf` skill;
3. write parsed data into `附件简历文件名`, `附件简历链接`, `附件简历文本`, `附件简历摘要`, and `附件简历解析状态`.

Do not mix `电子简历*` and `附件简历*` fields.

## Live test

Full local regression:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\test-kimi-boss-adapter.ps1" -RequireCandidate
```

This test:

- validates every adapter module with `node --check`;
- runs read commands against the existing BOSS tab;
- captures one candidate uid from `chatlist`;
- tests `chatmsg` and `resume` with that uid;
- verifies `resume` emits `电子简历姓名` and does not mix `附件简历文本`;
- tests all write-capable commands in dry-run mode;
- fails if any command changes BOSS `performance.timeOrigin`.

The live test does not send messages, greet candidates, mark candidates, request contact exchange, or send interview invites.

## Current validated result

Current machine validation passed for:

- `status`
- `chatlist`
- `recommend`
- `joblist`
- `stats`
- `label-list`
- `chatmsg`
- `resume`
- dry-run `send`
- dry-run `greet`
- dry-run `batchgreet`
- dry-run `mark`
- dry-run `exchange`
- dry-run `invite`

Every tested command kept `stable=true`; no BOSS hard reload was observed.

## Boundaries

- This adapter targets the recruiter side. OpenCLI `search` / `detail` are job-seeker-side job-search helpers and are not part of the recruiter workflow.
- Do not parallelize commands against the same BOSS tab.
- Keep PDF resume parsing in the `pdf` skill after the file is downloaded locally.
- Use Feishu / Lark skills for Base and document writes.
