# Resume scoring rubric

Scoring must be role-specific. Generate the rubric from the current job requirement before scoring candidates.

## Rubric construction

Create a 100-point rubric with 5-8 dimensions.

Recommended dimension types:

- Core role skills: language, framework, domain tools.
- System design and project delivery.
- Database, data modeling, cache, queue, or relevant infrastructure.
- Business/domain fit for the role.
- Deployment, reliability, observability, and operations.
- Integration experience: third-party APIs, webhooks, open platforms.
- Work style: ownership, independent delivery, collaboration.
- Bonus signals that are truly relevant to the role.

## Scoring rules

- Use evidence from normalized resume fields and raw resume JSON when needed.
- Penalize hard mismatches such as wrong role direction, insufficient years, missing required stack, or missing education only when the role requires them.
- Do not overfit to keywords. A project with equivalent architecture may satisfy a requirement even if it uses different naming.
- Keep scoring explainable. Every high or low score should map to visible resume evidence.
- Write the numeric score and a separate comment. Do not cram explanation into the score field.

## Suggested score bands

- 85-100: strong interview recommendation.
- 75-84: recommend interview, verify gaps.
- 65-74: interview only if pipeline needs more candidates or niche strength exists.
- 60-64: cautious; likely mismatch.
- Below 60: not recommended for this role.

## Comment format

Use this structure for Top candidates:

```text
强推荐面试。{姓名} 当前评分 {score} 分。
优势：{3-4 concrete strengths}。
风险：{1-3 concrete risks}。
面试关注：{specific technical/business probes}。
```

For lower-confidence candidates, adjust the first sentence to `推荐面试` or `可面试观察`.

## Parameterization checklist

Before writing or running scoring logic, identify:

- role title
- must-have skills
- preferred skills
- minimum years or education if any
- domain requirements
- deal breakers
- score field name
- candidate fields to read
- Top N threshold or count
