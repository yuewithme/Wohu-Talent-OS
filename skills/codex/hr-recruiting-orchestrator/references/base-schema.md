# Feishu Base schema guide

Use this guide for recruiting Bases. Field names must still be confirmed with `lark-cli base +field-list` before writing.

## Resume source rule

Do not mix the two resume sources:

- **电子简历**: the structured BOSS online resume / right-side candidate panel read by `scripts/kimi-boss.ps1 resume <uid>`.
- **附件简历**: a PDF / Word / uploaded resume file. Download it first, then parse it with the Codex `pdf` skill.

The Base should keep source-specific fields and optionally keep legacy / summary fields for human display. Never write PDF parsed text into `电子简历*` fields, and never write BOSS panel text into `附件简历*` fields.

## Default candidate fields

Core identity:

- `姓名`
- `性别`
- `年龄`
- `学历`
- `学校`
- `专业`
- `工作年限`

Intent and current state:

- `期望职位`
- `应聘职位`
- `期望城市`
- `期望薪资`
- `求职状态`
- `当前/最近公司`
- `当前/最近职位`

Canonical / summary resume content:

- `技能`
- `工作经历`
- `项目经历`
- `教育经历`
- `原始简历JSON`

These generic fields are for normalized display or legacy compatibility. For new sync code, write source-specific fields below first, then optionally copy selected values into generic summary fields.

Electronic resume fields:

- `电子简历姓名`
- `电子简历性别`
- `电子简历年龄`
- `电子简历学历`
- `电子简历工作年限`
- `电子简历活跃时间`
- `电子简历应聘职位`
- `电子简历期望职位`
- `电子简历期望城市`
- `电子简历期望薪资`
- `电子简历当前/最近公司`
- `电子简历当前/最近职位`
- `电子简历工作经历`
- `电子简历教育经历`
- `电子简历项目经历`
- `电子简历技能`
- `电子简历原始JSON`

Attachment resume fields:

- `附件简历文件`
- `附件简历文件名`
- `附件简历链接`
- `附件简历文本`
- `附件简历摘要`
- `附件简历解析状态`
- `简历来源说明`

BOSS and sync keys:

- `uid`
- `encryptGeekId`
- `securityId`
- `encryptJobId`
- `BOSS职位ID`
- `最近消息`
- `最近消息时间`

Evaluation fields:

- `岗位匹配评分`: number, 0-100.
- `岗位匹配点评`: text; write concise strengths, risks, and interview focus.
- `推荐等级`: text/select; recommended values are `强推荐`, `可约面`, `备选`, `暂缓`.
- `电子简历部门`: text; only stores department/team values found in the BOSS electronic-resume JSON. Write `未提供` when BOSS does not expose a department field instead of guessing from company or position.
- `数据状态说明`: text; records sync/scoring status and known data gaps, such as "BOSS电子简历未提供独立部门字段".
- `专属面试问题表链接`: URL/text; preferred target for generated interview documents.
- `专属面试问题表`: attachment; only use if API write is verified to work.

Outreach/action fields when needed:

- `最近触达动作`
- `最近触达时间`
- `最近触达结果`
- `触达失败原因`

## Write rules

1. Read `+field-list` before every write task.
2. Create missing fields only when the user has authorized writing to the Base and the field purpose is clear.
3. Write only storage fields. Do not write formula, lookup, system fields, or attachment cells through normal record update.
4. Use `+record-upload-attachment` only for attachment fields. If it returns `MOBILE_ONLY`, treat the attachment cell as unavailable from CLI/API.
5. For generated interview plans, prefer this reliable fallback:
   - Generate local Markdown.
   - Import it with `lark-cli drive +import --type docx`.
   - Write the returned `url` to `专属面试问题表链接`.
6. When syncing `scripts/kimi-boss.ps1 resume <uid>` output, map the Chinese `电子简历*` keys directly into the matching Base fields.
7. When parsing an attachment PDF, write only `附件简历*` fields and keep the parser evidence separate from `电子简历原始JSON`.
8. When re-scoring candidates from a job table, use `scripts/rerank-candidates-by-job-table.ps1`; do not keep one-off hardcoded Base IDs in the global skill.

## Read rules

- Known `record_id`: use `+record-get` with projected fields.
- Keyword candidate lookup: use `+record-search` with explicit fields.
- Top N or ranking: use Base view/sort/query when possible; do not infer global ranking from a partial local page.
- More than 200 records: paginate deliberately or use Base query/view capabilities.
- Electronic resume: read through `scripts/kimi-boss.ps1 resume <uid>` and store into `电子简历*` fields.
- Resume PDF attachments: download to a local file first, then use the `pdf` skill for extraction. Base stores the resulting text, evidence summary, or Feishu document link in `附件简历*` fields; it is not the parser.

## Schema helper

Use this helper to create the source-specific resume fields in an existing recruiting Base:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\ensure-recruiting-base-schema.ps1" `
  -BaseToken "<base_token>" `
  -TableId "<table_id>"
```

Preview only:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\ensure-recruiting-base-schema.ps1" `
  -BaseToken "<base_token>" `
  -TableId "<table_id>" `
  -DryRun
```

## Audit outputs

When running scripts, keep local summaries as evidence, for example:

- sync summary
- score results
- Top candidate comments
- generated interview Markdown

Local files are evidence, not the business source of truth. Final business state should be visible from Base.
