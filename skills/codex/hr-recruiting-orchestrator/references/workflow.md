# Recruiting workflow

This workflow mirrors the hiring process diagram and keeps Feishu Base as the system of record.

## 1. Role setup

Inputs:

- Interviewer or hiring manager intent.
- Job requirements and responsibilities.
- BOSS screening conditions.
- Desired interview dimensions.

Outputs:

- Feishu document or Base fields containing job requirements and BOSS filters.
- Role-specific interview dimensions.
- Role-specific scoring rubric.

Workflow:

1. Use `job-description-writer` to create or refine the job requirement.
2. Extract BOSS search / filter conditions from the role requirement.
3. Create evaluation dimensions before collecting large candidate batches.
4. Save role requirement and filters into Feishu Base or an attached Feishu document.

## 2. Candidate collection

Inputs:

- Existing focused BOSS tab.
- BOSS filters / search strategy.
- Target Feishu Base token and table ID.

Workflow:

1. Default to `scripts/kimi-boss.ps1` for BOSS recruiter reads because it reuses the logged-in tab and checks `performance.timeOrigin` for reload stability.
2. Keep `opencli-boss-locked` only as a controlled fallback when the Kimi route is unavailable and the OpenCLI navigation/evaluate risks have been explicitly accepted.
3. Read BOSS candidate list, candidate detail, chat list, and resume as needed.
4. Normalize fields: name, gender, age, degree, school, major, work years, expected role/city/salary, current company/title, skills, work history, project history, education, recent message/time, identifiers, and raw resume JSON.
5. Write records to Feishu Base with `lark-base`.
6. Keep sync summaries so later scoring can be audited.

## 3. Screening and scoring

Inputs:

- Role requirement and scoring rubric.
- Normalized candidate rows.

Workflow:

1. Read candidate fields from Base with minimal projection.
2. Read the job table fields `需求背景描述`, `岗位名称`, `岗位需求描述`, and `简历筛选条件`.
3. Run `scripts/rerank-candidates-by-job-table.ps1` to score every candidate against the latest job row.
4. Write `岗位匹配评分`, `岗位匹配点评`, `推荐等级`, `电子简历部门`, and `数据状态说明`.
5. Sort or query Top candidates in Base rather than relying on partial local pages.
6. Write Top candidate comments with strengths, risks, and interview focus.

## 4. Resume attachment / detail review

Inputs:

- Top candidate list.
- BOSS resume attachment or detail page.
- Local PDF resume file when an attachment has been downloaded.

Workflow:

1. Retrieve resume attachments/details through the locked BOSS route.
2. If the resume is a PDF attachment, download it locally and use the `pdf` skill to extract content and evidence. Do not build a separate PDF parser in this skill.
3. Use BOSS page text only as a secondary observation aid through `kimi-webbridge`; the primary evidence for attachments is the downloaded file plus `pdf` skill reading.
4. Read and summarize resume evidence.
5. Write attachment links, parsed text, or review notes into Base.
6. If a Base attachment field rejects API writes, store Feishu document links in URL/text fields.

## 5. Interview plan

Inputs:

- Role requirement.
- Candidate resume and score/comment.
- Interview dimensions.

Workflow:

1. Use `interview-kit-builder` patterns for structured questions and rubrics.
2. Build candidate-specific interview questions, not generic interview questions.
3. Cover role fit, project truthfulness, technical depth, business understanding, risks, and onsite exercises.
4. Import the Markdown as a Feishu online document and write the URL back to Base.

## 6. Outreach and scheduling

Inputs:

- Candidate record and intended action.
- Message text or invite details.

Workflow:

1. Stop and confirm BOSS write action details in the current turn.
2. Execute only through the locked BOSS wrapper after confirmation.
3. Write action result, timestamp, and failure reason back to Base.

## Completion criteria

- Base has the latest human-readable candidate state.
- Generated documents are accessible through Base links.
- Any BOSS side effect has a confirmation and an action log.
- Failures are explicit; do not silently downgrade from attachment to link without noting why.
