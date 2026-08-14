# Scripts boundary

This v1 skill is an orchestrator. Keep project-specific business scripts outside the global skill until they are parameterized.

The exception is the BOSS recruiter browser adapter:

- `kimi-boss.ps1`
- `kimi-boss-adapter/*.mjs`
- `test-kimi-boss-adapter.ps1`
- `ensure-recruiting-base-schema.ps1`
- `ensure-recruiting-base-schema.mjs`
- `sync-boss-electronic-resumes-to-base.ps1`
- `sync-boss-electronic-resumes-to-base.mjs`
- `rerank-candidates-by-job-table.ps1`
- `rerank-candidates-by-job-table.py`

These scripts are now part of the global skill because they are parameterized, do not contain project-specific Base IDs, and replace the unstable OpenCLI BOSS page execution path.

Stable project scripts may live under the active project workspace, for example:

- `sync-boss-to-base.mjs`
- `score-boss-resumes.mjs`
- `comment-top10-resumes.mjs`

Before migrating them into this skill, parameterize:

- Base token
- table id
- field mapping
- role requirement / rubric file
- Top N
- dry-run vs write mode

Do not copy project-specific constants into this global skill as defaults.

## Kimi BOSS recruiter adapter

Default command:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\kimi-boss.ps1" chatlist --limit 20 -f json
```

Supported recruiter-side read commands:

- `status`
- `chatlist`
- `chatmsg`
- `resume`
- `recommend`
- `joblist`
- `stats`
- `label-list`

Supported write-capable commands:

- `send`
- `greet`
- `batchgreet`
- `invite`
- `mark`
- `exchange`

Write-capable commands are dry-run by default. They only execute when `--confirm` is present, and the orchestrator must still obtain explicit user approval before adding `--confirm`.

Use `-f object` when testing because it includes `stable`, `before`, and `after` fields:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\kimi-boss.ps1" chatlist --limit 1 -f object
```

`resume <uid>` returns the BOSS electronic resume only. It includes Base-ready fields such as `电子简历姓名`, `电子简历工作经历`, `电子简历项目经历`, and `电子简历原始JSON`. It must not write `附件简历文本`; attachment resumes are parsed separately by the `pdf` skill.

Project experience is not taken from the compact right-side chat panel alone. The adapter opens a reusable hidden BOSS online-resume iframe and reads `IFRAME_DONE.abstractData.geekProjExpList`. This avoids missing project rows for candidates that are not currently visible in the chat list and avoids the Chrome memory leak caused by creating a new WebAssembly resume iframe for every candidate.

## Recruiting Base schema helper

Create / verify source-specific resume fields:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\ensure-recruiting-base-schema.ps1" `
  -BaseToken "<base_token>" `
  -TableId "<table_id>" `
  -DryRun
```

Remove `-DryRun` to create missing fields. The helper creates `电子简历*` fields and `附件简历*` fields so the two resume sources stay separate.

## Bulk electronic resume sync

Use this after the Base schema exists and the BOSS recruiter page is logged in:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\sync-boss-electronic-resumes-to-base.ps1" `
  -BaseToken "<base_token>" `
  -TableId "<table_id>" `
  --limit 100
```

The sync:

- reads BOSS `chatlist` through the Kimi adapter;
- reads each candidate's BOSS electronic resume through `resume <uid>`;
- fills `电子简历项目经历` from the online-resume detail list; if BOSS has no project list, writes `(电子简历未填写项目经历)` instead of leaving the cell blank;
- matches existing Base records by numeric `uid`, encrypted `uid`, or `encryptGeekId`;
- updates existing records and creates only missing records;
- writes BOSS electronic resume fields only to `电子简历*`;
- writes `数据状态说明` so reviewers can distinguish "project filled", "candidate did not fill project experience", and "attachment resume not parsed";
- sets `附件简历解析状态` to `无附件` unless an attachment flow later updates it;
- never sends BOSS messages, greetings, invites, marks, or contact exchanges.

The summary is written to:

```text
$HOME\.codex\skills\hr-recruiting-orchestrator\artifacts\boss-electronic-resume-sync-summary.json
```

## Candidate re-score by job table

Use this after candidate electronic resumes have been synced and the job table contains the latest requirement fields:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\rerank-candidates-by-job-table.ps1" `
  --base-token "<base_token>" `
  --candidate-table-id "<candidate_table_id>" `
  --job-table-id "<job_table_id>"
```

Input tables:

- Candidate table: stores `电子简历*` and `附件简历*` fields separately. This script scores from the electronic-resume fields and does not parse or overwrite attachment-resume text.
- Job table: reads `需求背景描述`, `岗位名称`, `岗位需求描述`, and `简历筛选条件` from the first job row.

The re-score helper:

- creates missing write-back fields when needed: `岗位匹配评分`, `岗位匹配点评`, `推荐等级`, `电子简历部门`, `数据状态说明`;
- reads every candidate row within `--candidate-limit` and writes score, comment, recommendation level, department status, and data status;
- uses the job table as the rubric source only; it does not mix job-description keywords into candidate evidence, preventing false-positive matches;
- extracts department only when BOSS electronic-resume JSON exposes a real department/team key; if BOSS does not expose that field, writes `未提供` and explains this in `数据状态说明`;
- writes Chinese JSON through temporary file-backed `--json @payload.json` calls instead of inline PowerShell JSON;
- emits auditable artifacts:

```text
$HOME\.codex\skills\hr-recruiting-orchestrator\artifacts\candidate-rerank-summary.json
$HOME\.codex\skills\hr-recruiting-orchestrator\artifacts\candidate-rerank-list.md
```

Use `--dry-run` to generate artifacts without writing records.

## Test script

Use `test-hr-recruiting-orchestrator.ps1` for safe preflight and regression checks.

Default behavior is static and environment-safe:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\test-hr-recruiting-orchestrator.ps1"
```

Optional checks:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\test-hr-recruiting-orchestrator.ps1" `
  -BaseToken "<base_token>" `
  -TableId "<table_id>" `
  -RecordId "<record_id>" `
  -RunBossSmoke
```

Safety boundaries:

- The script never runs BOSS write actions.
- The script never writes Feishu Base records.
- `-RunBossSmoke` only runs a single `chatlist --limit 1 -f json` through `opencli-boss-locked`.
- BOSS smoke requires a valid existing BOSS browser tab and unbinds `site:boss` after the command through the locked wrapper.
- Treat any failed BOSS patch or JavaScript syntax check as a blocker before candidate collection.

Use `test-kimi-boss-adapter.ps1` for the live Kimi adapter regression:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\test-kimi-boss-adapter.ps1" -RequireCandidate
```

This test runs all read commands and write-command dry-runs against the existing logged-in BOSS tab. It fails if any command changes BOSS `performance.timeOrigin`.
