---
name: hr-recruiting-orchestrator
description: Use when orchestrating an end-to-end recruiting workflow with HR skills, BOSS Zhipin/OpenCLI, Feishu/Lark Base, resume scoring, candidate comments, interview kits, or hiring pipeline automation. Coordinates job requirement creation, BOSS screening conditions, candidate collection, Base synchronization, scoring rubrics, Top candidate reviews, personalized interview question documents, and guarded outreach. Use for Chinese hiring workflows involving BOSS, 飞书多维表格, 简历评分, 面试问题表, HR skills, or recruiting process SOPs.
---

# HR Recruiting Orchestrator

## Operating mode

Default to a semi-automated recruiting workflow:

- Read, collect, normalize, score, rank, comment, and generate interview materials automatically when the user has already identified the target Base / role / candidate set.
- Treat BOSS write actions as external side effects. Do not run `send`, `greet`, `batchgreet`, `invite`, `mark`, or `exchange` without explicit confirmation of target, action, and content in the current turn.
- Use Feishu Base as the primary business database. Keep local files only as evidence, temporary payloads, or generated source documents.
- Do not modify existing BOSS adapter files or project scripts unless the user explicitly asks for engineering changes. This skill is an orchestrator first.

## Required skill routing

Use these skills and tools by phase:

- Job requirements / JD: `job-description-writer`.
- Interview process, scorecards, and interview question kits: `interview-kit-builder`.
- BOSS read operations: use the local Kimi-backed recruiter adapter first: `scripts/kimi-boss.ps1`. It covers `chatlist`, `chatmsg`, `resume`, `recommend`, `joblist`, `stats`, and `label-list`, and current live tests show `stable=true` across all read commands.
- BOSS OpenCLI operations: `opencli-boss-locked` is fallback only; never run raw `opencli boss ...` unless the user explicitly asks for a controlled reproduction test.
- BOSS page observation and visual/DOM diagnosis: use `kimi-webbridge` to inspect the existing page state, visible text, screenshots, tabs, and reload symptoms.
- Resume handling: keep **BOSS electronic resume** and **attachment resume** separate. Read electronic resume through `scripts/kimi-boss.ps1 resume <uid>` into `电子简历*` fields; use the `pdf` skill only after an attachment resume PDF is downloaded locally, then write parsed results into `附件简历*` fields.
- Feishu Base: `lark-base`; read the relevant command reference before each Base command.
- Feishu document import / online document links: `lark-drive` or `lark-doc`.

## Phase router

1. **Role setup**: create or refine job requirements, BOSS search filters, interview dimensions, and scoring rubric. Read `references/workflow.md` and `references/scoring-rubric.md`.
2. **Candidate collection**: read BOSS candidate list/chat/resume via `scripts/kimi-boss.ps1`, normalize candidate fields, and write Base records. Read `references/boss-rules.md`, `references/kimi-boss-adapter.md`, and `references/base-schema.md`.
3. **Screening and scoring**: read the job table and candidate table, apply the role-specific scoring rubric, write scores, recommendation levels, department status, and comments. Prefer the reusable `scripts/rerank-candidates-by-job-table.ps1` helper after reading `references/scoring-rubric.md` and `references/base-schema.md`.
4. **Interview plan**: generate candidate-specific interview questions from the candidate resume and role requirements. Read `references/interview-plan.md`.
5. **Outreach / actions**: confirm every BOSS write action first, execute through the locked wrapper, then write action results back to Base. Read `references/boss-rules.md` and `references/base-schema.md`.

## BOSS hard rules

- Prefer Kimi-backed BOSS reads over OpenCLI BOSS adapter reads.
- Use `scripts/kimi-boss.ps1` as the default BOSS recruiter adapter. Use `-f object` when you need stability evidence.
- Run BOSS read actions serially. Do not parallelize multiple live-page operations against the same BOSS tab.
- If OpenCLI is used as fallback, always use the locked wrapper from `opencli-boss-locked`, keep debugger attachment just-in-time, and unbind immediately after the command.
- Do not run raw `opencli boss ... --site-session persistent --keep-tab true`; benchmark evidence shows OpenCLI Browser Bridge `exec` / `page.evaluate` hard-reloads BOSS.
- BOSS write actions remain external side effects no matter which browser-control layer is used. Do not run `send`, `greet`, `batchgreet`, `invite`, `mark`, or `exchange` without explicit confirmation.
- If the page refreshes or the user reports instability, first stabilize with `opencli browser site:boss unbind` and stop any long-running BOSS loop.

## Base hard rules

- Always read the target table fields before writing fields or records.
- Use Base field names exactly as returned by `+field-list`; do not guess field names.
- Attachment fields may reject CLI/API writes with `MOBILE_ONLY`. For generated interview documents, prefer importing the local Markdown as a Feishu Docx and writing the online document URL into a URL/text field.
- Keep the original BOSS raw JSON when available, but write normalized fields for human review.

## Resume attachment rules

- Retrieve resume attachment metadata or downloadable files through the guarded source route: BOSS via `opencli-boss-locked`, or Feishu Base attachments via `lark-base` / `lark-doc` media download.
- Electronic resume is not an attachment. Store it in `电子简历姓名`, `电子简历工作经历`, `电子简历教育经历`, `电子简历原始JSON`, and related `电子简历*` fields.
- Once a PDF resume attachment is local, use the `pdf` skill to extract and summarize it. Do not reimplement PDF parsing inside this skill or rely on BOSS visible-page text as the attachment parser.
- Store extracted attachment text and evidence summaries in `附件简历文本`, `附件简历摘要`, `附件简历解析状态`, and related `附件简历*` fields according to `references/base-schema.md`.

## Deliverables by task type

- Role setup: job requirement document, BOSS screening conditions, scoring rubric, interview dimensions.
- Candidate sync: Base records with raw and normalized candidate data plus sync summary.
- Screening: score column, recommendation level, ranking, Top candidate comments, department/data-status notes, summary buckets.
- Interview plan: Feishu online document link written back to Base; local Markdown evidence when useful.
- Outreach: confirmed action log with target, action, result, timestamp, and failure reason if any.

## References

- `references/workflow.md`: end-to-end workflow from the process diagram.
- `references/base-schema.md`: Base fields, write patterns, and document-link fallback.
- `references/boss-rules.md`: OpenCLI/BOSS safety and command policy.
- `references/kimi-boss-adapter.md`: Kimi-backed BOSS recruiter adapter commands, safety, and live test.
- `references/kimi-boss-benchmark.md`: Kimi vs OpenCLI benchmark result and current tool-selection rule.
- `references/scoring-rubric.md`: parameterized resume scoring design.
- `references/interview-plan.md`: personalized interview document standard.
- `scripts/README.md`: script migration boundary for this v1 skill.
