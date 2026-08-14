# Personalized interview plan guide

Generate interview plans from the candidate resume, role requirement, score, and known risk points.

## Output target

Default target:

1. Create local Markdown as evidence.
2. Import it as Feishu Docx with `lark-cli drive +import --type docx`.
3. Write the Feishu Docx URL to a Base URL/text field such as `专属面试问题表链接`.

Use Base attachment fields only after a successful write verification. If the attachment write returns `MOBILE_ONLY`, use the document-link fallback and state the limitation.

## Document structure

Use this structure:

1. Title: `{候选人}｜{岗位名称}专属面试问题表`.
2. Candidate resume summary.
3. Interview goals and risks to verify.
4. Interview question table grouped by competency.
5. Candidate-specific project deep dives.
6. System design or practical exercise.
7. Scorecard and decision guide.
8. Final interviewer notes.

## Question table fields

Each question should include:

- question
- follow-up probes
- competency / assessment target
- strong answer signals
- risk signals

## Question design rules

- Make questions specific to the candidate resume. Prefer project names, claimed architecture, claimed metrics, and claimed responsibilities.
- Do not generate only generic Java, AI, product, or HR questions.
- Include truthfulness checks for unusually broad or strong claims.
- For technical roles, include architecture, data model, failure mode, deployment, and debugging questions.
- For AI / automation roles, include API abstraction, async tasks, retries, idempotency, cost tracking, and quality evaluation when relevant.
- For management-heavy candidates, verify current hands-on coding depth.

## Interview coverage

A strong interview plan usually covers:

- contribution boundary and authenticity
- core technical depth
- role-specific domain transfer
- system design scenario
- failure handling and observability
- collaboration and delivery
- practical exercise or whiteboard task
- final hiring recommendation rubric
