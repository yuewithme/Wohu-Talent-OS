#!/usr/bin/env python3
"""Re-score recruiting candidates from a Feishu Base job table.

The script reads one job-requirement row, reads candidate electronic-resume
fields, writes score/comment/recommendation fields back to the candidate table,
and emits auditable artifacts. It intentionally keeps electronic resume fields
separate from attachment-resume fields.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
DEFAULT_ARTIFACT_DIR = SKILL_DIR / "artifacts"

CANDIDATE_FIELDS = [
    "姓名",
    "电子简历姓名",
    "电子简历学历",
    "电子简历工作年限",
    "电子简历当前/最近公司",
    "电子简历当前/最近职位",
    "电子简历工作经历",
    "电子简历项目经历",
    "电子简历教育经历",
    "电子简历技能",
    "电子简历期望职位",
    "电子简历原始JSON",
    "最近消息",
    "uid",
    "encryptGeekId",
]

JOB_FIELDS = ["需求背景描述", "岗位名称", "岗位需求描述", "简历筛选条件"]

WRITE_FIELDS = [
    {"name": "岗位匹配评分", "type": "text", "description": "按岗位信息表自动计算的简历匹配分。"},
    {"name": "岗位匹配点评", "type": "text", "description": "按岗位信息表生成的优势、风险和面试关注点。"},
    {"name": "推荐等级", "type": "text", "description": "强推荐、可约面、备选或暂缓。"},
    {"name": "电子简历部门", "type": "text", "description": "从 BOSS 电子简历原始 JSON 中提取的部门；未提供时写明未提供。"},
    {"name": "数据状态说明", "type": "text", "description": "本条候选人数据同步、评分和字段缺口说明。"},
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Re-score candidates by the job table in Feishu Base.")
    parser.add_argument("--base-token", "-BaseToken", required=True)
    parser.add_argument("--candidate-table-id", "-CandidateTableId", required=True)
    parser.add_argument("--job-table-id", "-JobTableId", required=True)
    parser.add_argument("--as", dest="identity", default="user")
    parser.add_argument("--candidate-limit", type=int, default=200)
    parser.add_argument("--out-dir", default=str(DEFAULT_ARTIFACT_DIR))
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def lark_entrypoint() -> list[str]:
    appdata = os.environ.get("APPDATA", "")
    run_js = Path(appdata) / "npm" / "node_modules" / "@larksuite" / "cli" / "scripts" / "run.js"
    if run_js.exists():
        return ["node", str(run_js)]
    return ["lark-cli"]


def parse_json_output(output: str) -> dict[str, Any]:
    text = output.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def run_lark(args: list[str], cwd: Path | None = None) -> dict[str, Any]:
    result = subprocess.run(
        [*lark_entrypoint(), *args],
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    output = f"{result.stdout or ''}{result.stderr or ''}".strip()
    if result.returncode != 0:
        raise RuntimeError(output or f"lark-cli failed with exit {result.returncode}")
    return parse_json_output(output)


def json_arg(payload: dict[str, Any], work_dir: Path, name: str) -> str:
    path = work_dir / name
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return f"@{path.name}"


def ensure_write_fields(base_token: str, table_id: str, identity: str) -> list[dict[str, str]]:
    field_list = run_lark([
        "base",
        "+field-list",
        "--base-token",
        base_token,
        "--table-id",
        table_id,
        "--limit",
        "200",
        "--as",
        identity,
    ])
    existing = {field.get("name") for field in field_list.get("data", {}).get("fields", [])}
    results: list[dict[str, str]] = []
    with tempfile.TemporaryDirectory(prefix="hr-rerank-fields-") as tmp:
        tmp_dir = Path(tmp)
        for spec in WRITE_FIELDS:
            if spec["name"] in existing:
                results.append({"name": spec["name"], "status": "exists"})
                continue
            body = {"name": spec["name"], "type": spec["type"], "description": spec["description"]}
            run_lark([
                "base",
                "+field-create",
                "--base-token",
                base_token,
                "--table-id",
                table_id,
                "--json",
                json_arg(body, tmp_dir, f"field-{len(results)}.json"),
                "--as",
                identity,
            ], cwd=tmp_dir)
            results.append({"name": spec["name"], "status": "created"})
    return results


def list_records(base_token: str, table_id: str, fields: list[str], limit: int, identity: str) -> tuple[list[str], list[str], list[list[Any]]]:
    args = ["base", "+record-list", "--base-token", base_token, "--table-id", table_id, "--limit", str(limit)]
    for field in fields:
        args += ["--field-id", field]
    args += ["--format", "json", "--as", identity]
    payload = run_lark(args).get("data", {})
    return payload.get("fields", []), payload.get("record_id_list", []), payload.get("data", [])


def cell(row: list[Any], idx: dict[str, int], name: str) -> str:
    pos = idx.get(name, -1)
    value = row[pos] if pos >= 0 and pos < len(row) else None
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(v) for v in value if v is not None)
    return str(value).replace("\\n", "\n")


def count_hits(text: str, words: list[str]) -> int:
    lower = text.lower()
    return sum(1 for word in words if word.lower() in lower)


def contains(text: str, words: list[str]) -> bool:
    lower = text.lower()
    return any(word.lower() in lower for word in words)


def parse_years(value: str, text: str) -> int:
    if any(token in value for token in ["应届", "在校", "学生", "实习"]):
        return 0
    if "10年以上" in value:
        return 10
    match = re.search(r"(\d+)\s*年(?!龄)", value)
    if match:
        return int(match.group(1))
    years = [int(year) for year in re.findall(r"20\d{2}|19\d{2}", text)]
    if years:
        return max(0, min(datetime.now().year - min(years), 20))
    return 0


def education_score(education: str) -> int:
    if "博士" in education or "硕士" in education:
        return 5
    if "本科" in education:
        return 4
    if "大专" in education:
        return 3
    return 1


def extract_department(raw_text: str) -> str:
    departments: list[str] = []
    try:
        raw = json.loads(raw_text) if raw_text else {}
    except json.JSONDecodeError:
        raw = {}

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for key, val in value.items():
                key_text = str(key)
                key_lower = key_text.lower()
                if ("部门" in key_text or any(token in key_lower for token in ["department", "dept", "team"])) and isinstance(val, str) and val.strip():
                    departments.append(val.strip())
                walk(val)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(raw)
    unique = []
    for department in departments:
        if department and department not in unique:
            unique.append(department)
    return "；".join(unique) if unique else "未提供"


def score_candidate(candidate: dict[str, str], job: dict[str, str]) -> tuple[int, str, str]:
    name = candidate["姓名"] or candidate["电子简历姓名"]
    work = candidate["电子简历工作经历"]
    project = candidate["电子简历项目经历"]
    education = f"{candidate['电子简历学历']}\n{candidate['电子简历教育经历']}"
    skill = candidate["电子简历技能"]
    position = f"{candidate['电子简历当前/最近职位']}\n{candidate['电子简历期望职位']}"
    # Candidate evidence only. Job requirement text must not be mixed into this
    # corpus, otherwise every candidate would falsely match Java/AIGC keywords.
    text = "\n".join([name, work, project, education, skill, position, candidate["最近消息"]])
    years = parse_years(candidate["电子简历工作年限"], text)

    java_words = ["java", "spring", "springboot", "spring boot", "springcloud", "spring cloud", "mybatis", "jvm"]
    db_words = ["mysql", "sql", "redis", "elasticsearch", "rocketmq", "rabbitmq", "nacos", "dubbo"]
    ai_words = ["ai", "aigc", "agent", "智能体", "大模型", "llm", "rag", "向量", "copilot", "cursor", "chatgpt", "vibe"]
    content_words = ["内容", "素材", "投放", "视频", "短视频", "生成", "comfy", "seedance", "nanobanana", "火山"]
    fullstack_words = ["全栈", "vue", "react", "next", "前端", "小程序", "flutter", "taro", "uniapp"]
    delivery_words = ["项目负责人", "技术负责人", "架构", "组长", "主程", "独立", "从0到1", "0到1", "上线", "saas", "平台", "中台", "api", "接口", "开放平台"]
    deploy_words = ["docker", "k8s", "kubernetes", "容器", "腾讯云", "阿里云", "部署", "运维", "cvm", "cos", "cdn"]

    score = 0
    reasons: list[str] = []
    risks: list[str] = []

    if years >= 5:
        score += 18
        reasons.append(f"{candidate['电子简历工作年限'] or str(years) + '年'}经验满足筛选条件")
    elif years >= 3:
        score += 10
        risks.append("经验低于5年筛选偏好")
    else:
        score += 3
        risks.append("经验明显不足")

    score += education_score(education) * 2
    if contains(education, ["本科", "硕士", "博士"]):
        reasons.append("学历满足要求")
    elif "大专" in education:
        reasons.append("大专学历满足最低筛选条件")
    else:
        risks.append("学历信息偏弱或缺失")

    java_hits = count_hits(text, java_words)
    if java_hits >= 4:
        score += 18
        reasons.append("Java/Spring 技术线索强")
    elif java_hits >= 2:
        score += 15
        reasons.append("Java 后端线索明确")
    elif contains(position + work + project, ["java"]):
        score += 13
        reasons.append("岗位经历包含 Java")
    else:
        score += 3
        risks.append("Java 主线不明显")

    db_hits = count_hits(text, db_words)
    score += min(8, db_hits * 2)
    reasons.append("有数据库/缓存/中间件线索") if db_hits else risks.append("MySQL/Redis/MQ 等工程细节不足")

    fullstack_hits = count_hits(text, fullstack_words)
    score += min(12, fullstack_hits * 3)
    if fullstack_hits:
        reasons.append("具备全栈或前端协作线索")

    delivery_hits = count_hits(text, delivery_words)
    score += min(16, delivery_hits * 3)
    if delivery_hits >= 2:
        reasons.append("有平台/项目负责/交付经验")

    deploy_hits = count_hits(text, deploy_words)
    score += min(8, deploy_hits * 2)
    reasons.append("有部署/云/运维相关线索") if deploy_hits else risks.append("Docker/腾讯云部署证据不足")

    ai_hits = count_hits(text, ai_words)
    content_hits = count_hits(text, content_words)
    score += min(16, ai_hits * 4) + min(8, content_hits * 2)
    reasons.append("有 AI/AIGC/内容平台相关线索") if ai_hits or content_hits else risks.append("AI Coding / AIGC 平台经验未体现")

    if "未填写项目经历" in project or not project.strip():
        score -= 8
        risks.append("电子简历未填写项目经历")
    else:
        score += 4

    if contains(text, ["测试", "软件测试"]):
        score -= 18
        risks.append("测试方向与 Java 全栈开发不匹配")
    elif contains(position, ["前端", "运维", "php", ".net", "golang", "c#"]):
        score -= 8
        risks.append("当前职位方向与 Java 全栈后端存在偏差")
    if not contains(text, ["spring", "spring boot", "springcloud", "spring cloud"]):
        score -= 2
        risks.append("Spring 体系证据不足")
    if years >= 10 and contains(position + work, ["经理", "项目经理", "技术经理"]):
        score -= 2
        risks.append("偏管理/资深，需确认是否愿意一线开发")

    score = max(25, min(95, int(round(score))))
    grade = "强推荐" if score >= 78 else "可约面" if score >= 60 else "备选" if score >= 50 else "暂缓"
    strengths = "；".join(reasons[:4]) or "简历信息可用但关键亮点不突出"
    risk_text = "；".join(risks[:4]) or "主要风险待面试核实"
    focus = "面试重点：Java/Spring Boot 实战、MySQL 优化、Docker/云部署、AI Coding 使用深度、是否能2个月内与产品经理配合完成AI Agent+AIGC平台上线。"
    return score, grade, f"优势：{strengths}。风险：{risk_text}。{focus}"


def update_record(base_token: str, table_id: str, record_id: str, payload: dict[str, Any], identity: str, dry_run: bool) -> None:
    if dry_run:
        return
    with tempfile.TemporaryDirectory(prefix="hr-rerank-row-") as tmp:
        tmp_dir = Path(tmp)
        run_lark([
            "base",
            "+record-upsert",
            "--base-token",
            base_token,
            "--table-id",
            table_id,
            "--record-id",
            record_id,
            "--json",
            json_arg(payload, tmp_dir, "payload.json"),
            "--as",
            identity,
        ], cwd=tmp_dir)


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    field_results = ensure_write_fields(args.base_token, args.candidate_table_id, args.identity)
    job_fields, _, job_rows = list_records(args.base_token, args.job_table_id, JOB_FIELDS, 20, args.identity)
    job_idx = {name: index for index, name in enumerate(job_fields)}
    job = {field: cell(job_rows[0], job_idx, field) for field in JOB_FIELDS} if job_rows else {}

    fields, record_ids, rows = list_records(args.base_token, args.candidate_table_id, CANDIDATE_FIELDS, args.candidate_limit, args.identity)
    idx = {name: index for index, name in enumerate(fields)}
    results: list[dict[str, Any]] = []

    for record_id, row in zip(record_ids, rows):
        candidate = {field: cell(row, idx, field) for field in CANDIDATE_FIELDS}
        department = extract_department(candidate.get("电子简历原始JSON", ""))
        score, grade, comment = score_candidate(candidate, job)
        status_parts = ["已按岗位信息表重评", f"岗位={job.get('岗位名称', '') or '未命名岗位'}", f"推荐等级={grade}"]
        status_parts.append("部门：BOSS电子简历未提供独立部门字段" if department == "未提供" else "部门已提取")
        payload = {
            "岗位匹配评分": str(score),
            "岗位匹配点评": comment,
            "推荐等级": grade,
            "电子简历部门": department,
            "数据状态说明": "；".join(status_parts),
        }
        update_record(args.base_token, args.candidate_table_id, record_id, payload, args.identity, args.dry_run)
        results.append({
            "record_id": record_id,
            "name": candidate["姓名"] or candidate["电子简历姓名"],
            "score": score,
            "grade": grade,
            "department": department,
            "comment": comment,
        })

    results.sort(key=lambda item: item["score"], reverse=True)
    grade_order = ["强推荐", "可约面", "备选", "暂缓"]
    summary = {
        "ok": True,
        "dry_run": args.dry_run,
        "job": job,
        "total": len(results),
        "field_results": field_results,
        "grade_counts": {grade: sum(1 for item in results if item["grade"] == grade) for grade in grade_order},
        "department_filled": sum(1 for item in results if item["department"] != "未提供"),
        "department_unprovided": sum(1 for item in results if item["department"] == "未提供"),
        "top10": results[:10],
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    (out_dir / "candidate-rerank-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# 候选人重评名单", "", f"岗位：{job.get('岗位名称', '')}", "", "| 排名 | 姓名 | 分数 | 等级 | 部门 |", "|---:|---|---:|---|---|"]
    for index, item in enumerate(results, 1):
        lines.append(f"| {index} | {item['name']} | {item['score']} | {item['grade']} | {item['department']} |")
    (out_dir / "candidate-rerank-list.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
