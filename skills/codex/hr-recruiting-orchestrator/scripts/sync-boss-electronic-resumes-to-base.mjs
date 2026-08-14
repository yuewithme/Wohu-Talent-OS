#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = dirname(__dirname);
const kimiCli = join(__dirname, 'kimi-boss-adapter', 'cli.mjs');
const larkRun = process.platform === 'win32' && process.env.APPDATA
  ? join(process.env.APPDATA, 'npm', 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js')
  : '';

function parseArgs(argv) {
  const args = { limit: 100, as: 'user', outDir: join(skillDir, 'artifacts') };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '-BaseToken' || token === '--base-token') args.baseToken = argv[++i];
    else if (token === '-TableId' || token === '--table-id') args.tableId = argv[++i];
    else if (token === '--limit' || token === '-Limit') args.limit = Number(argv[++i] || 100);
    else if (token === '--as' || token === '-As') args.as = argv[++i] || 'user';
    else if (token === '--out-dir') args.outDir = argv[++i] || args.outDir;
  }
  if (!args.baseToken || !args.tableId) {
    throw new Error('Usage: sync-boss-electronic-resumes-to-base.ps1 -BaseToken <token> -TableId <table_id> [--limit 100]');
  }
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  const output = String(result.stdout || '') + String(result.stderr || '');
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(output || command + ' failed with exit ' + result.status);
    error.exitCode = result.status;
    throw error;
  }
  return output.trim();
}

function runJson(command, args, options = {}) {
  const output = run(command, args, options);
  try { return JSON.parse(output); }
  catch (error) { throw new Error('Non-JSON output from ' + command + ': ' + output.slice(0, 500)); }
}

function runKimi(args) {
  return runJson('node', [kimiCli, ...args]);
}

function runLark(args) {
  const command = existsSync(larkRun) ? 'node' : 'lark-cli';
  const finalArgs = existsSync(larkRun) ? [larkRun, ...args] : args;
  return runJson(command, finalArgs);
}

function asText(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getCell(record, fields, name) {
  const index = fields.indexOf(name);
  return index >= 0 ? asText(record[index]) : '';
}

function compactPayload(payload) {
  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    clean[key] = value === null ? null : String(value);
  }
  return clean;
}

function buildPayload(candidate, resume) {
  const encryptedUid = asText(candidate.uid || candidate.encrypt_uid);
  const numericUid = asText(candidate.numeric_uid || '');
  const currentUid = numericUid || encryptedUid;
  const name = asText(resume['电子简历姓名'] || resume.name || candidate.name);
  const job = asText(resume['电子简历应聘职位'] || resume.job_chatting || candidate.job || candidate.job_name);
  const work = asText(resume['电子简历工作经历'] || resume.work_history);
  const education = asText(resume['电子简历教育经历'] || resume.education);
  const project = asText(resume['电子简历项目经历'] || resume.project_history);
  const skills = asText(resume['电子简历技能'] || resume.skills);
  const raw = asText(resume['电子简历原始JSON']) || JSON.stringify(resume);
  const hasProject = project && !project.includes('未填写项目经历');
  const hasSkills = skills && !skills.includes('未单独填写技能');
  const dataStatus = [
    'BOSS电子简历已同步',
    hasProject ? '项目经历已从在线简历详情补齐' : '项目经历：电子简历未填写',
    hasSkills ? '技能已同步' : '技能：电子简历未单独提供',
    '附件简历未解析：当前无附件或尚未下载PDF/Word附件'
  ].join('；');

  return compactPayload({
    '姓名': name,
    '性别': asText(resume['电子简历性别'] || resume.gender),
    '年龄': asText(resume['电子简历年龄'] || resume.age),
    '学历': asText(resume['电子简历学历'] || resume.degree),
    '工作年限': asText(resume['电子简历工作年限'] || resume.experience),
    '应聘职位': job,
    '期望职位': asText(resume['电子简历期望职位'] || resume.expect),
    '期望城市': asText(resume['电子简历期望城市'] || resume.expect_city),
    '期望薪资': asText(resume['电子简历期望薪资'] || resume.expect_salary),
    '当前/最近公司': asText(resume['电子简历当前/最近公司'] || resume.current_company || candidate.company),
    '当前/最近职位': asText(resume['电子简历当前/最近职位'] || resume.current_position || candidate.title),
    '技能': skills,
    '工作经历': work,
    '项目经历': project,
    '教育经历': education,
    '原始简历JSON': raw,
    'uid': currentUid,
    'encryptGeekId': encryptedUid,
    'securityId': asText(candidate.security_id),
    'encryptJobId': asText(candidate.encrypt_job_id),
    'BOSS职位ID': asText(candidate.encrypt_job_id),
    '最近消息': asText(candidate.last_msg),
    '最近消息时间': asText(candidate.last_time),
    '电子简历姓名': name,
    '电子简历性别': asText(resume['电子简历性别'] || resume.gender),
    '电子简历年龄': asText(resume['电子简历年龄'] || resume.age),
    '电子简历学历': asText(resume['电子简历学历'] || resume.degree),
    '电子简历工作年限': asText(resume['电子简历工作年限'] || resume.experience),
    '电子简历活跃时间': asText(resume['电子简历活跃时间'] || resume.active_time),
    '电子简历应聘职位': job,
    '电子简历期望职位': asText(resume['电子简历期望职位'] || resume.expect),
    '电子简历期望城市': asText(resume['电子简历期望城市'] || resume.expect_city),
    '电子简历期望薪资': asText(resume['电子简历期望薪资'] || resume.expect_salary),
    '电子简历当前/最近公司': asText(resume['电子简历当前/最近公司'] || resume.current_company || candidate.company),
    '电子简历当前/最近职位': asText(resume['电子简历当前/最近职位'] || resume.current_position || candidate.title),
    '电子简历工作经历': work,
    '电子简历教育经历': education,
    '电子简历项目经历': project,
    '电子简历技能': skills,
    '电子简历原始JSON': raw,
    '简历来源说明': '电子简历',
    '附件简历解析状态': '无附件',
    '数据状态说明': dataStatus
  });
}

function indexBaseRecords(baseRows) {
  const fields = baseRows.data.fields || [];
  const data = baseRows.data.data || [];
  const recordIds = baseRows.data.record_id_list || [];
  const byUid = new Map();
  const byEncrypted = new Map();
  const byName = new Map();
  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    const recordId = recordIds[i];
    const uid = getCell(row, fields, 'uid');
    const encrypted = getCell(row, fields, 'encryptGeekId');
    const name = getCell(row, fields, '姓名');
    if (uid) byUid.set(uid, recordId);
    if (encrypted) byEncrypted.set(encrypted, recordId);
    if (name && !byName.has(name)) byName.set(name, recordId);
  }
  return { fields, byUid, byEncrypted, byName, total: data.length };
}

function findRecordId(index, candidate) {
  const encryptedUid = asText(candidate.uid || candidate.encrypt_uid);
  const numericUid = asText(candidate.numeric_uid || '');
  const name = asText(candidate.name);
  return (numericUid && index.byUid.get(numericUid))
    || (encryptedUid && index.byUid.get(encryptedUid))
    || (encryptedUid && index.byEncrypted.get(encryptedUid))
    || (name && index.byName.get(name))
    || '';
}

function writeRecord(args, recordId, payload) {
  const argv = ['base', '+record-upsert', '--base-token', args.baseToken, '--table-id', args.tableId, '--json', JSON.stringify(payload), '--as', args.as];
  if (recordId) argv.splice(6, 0, '--record-id', recordId);
  return runLark(argv);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.outDir, { recursive: true });

  const chatObject = runKimi(['chatlist', '--limit', String(args.limit), '-f', 'object']);
  if (!chatObject.stable) throw new Error('BOSS page reloaded during chatlist; aborting sync');
  const candidates = chatObject.rows || [];

  const baseRows = runLark([
    'base', '+record-list', '--base-token', args.baseToken, '--table-id', args.tableId,
    '--limit', '200', '--field-id', '姓名', '--field-id', 'uid', '--field-id', 'encryptGeekId', '--format', 'json', '--as', args.as
  ]);
  const index = indexBaseRecords(baseRows);

  const summary = { totalCandidates: candidates.length, existingBaseRecords: index.total, updated: 0, created: 0, failed: 0, skipped: 0, stableFailures: 0, results: [] };

  for (const candidate of candidates) {
    const encryptedUid = asText(candidate.uid || candidate.encrypt_uid);
    const numericUid = asText(candidate.numeric_uid || '');
    const label = numericUid || encryptedUid || asText(candidate.name);
    try {
      if (!encryptedUid) {
        summary.skipped += 1;
        summary.results.push({ label, status: 'skipped', reason: 'missing encrypted uid' });
        continue;
      }
      const resumeObject = runKimi(['resume', encryptedUid, '-f', 'object']);
      if (!resumeObject.stable) {
        summary.stableFailures += 1;
        throw new Error('BOSS page reloaded during resume');
      }
      const resume = (resumeObject.rows || [])[0] || {};
      const payload = buildPayload(candidate, resume);
      const recordId = findRecordId(index, candidate);
      const write = writeRecord(args, recordId, payload);
      const writtenRecordId = write.data?.record?.record_id_list?.[0] || write.data?.record?.record_id || recordId || '';
      if (recordId) summary.updated += 1; else summary.created += 1;
      summary.results.push({ label, name: payload['姓名'], recordId: writtenRecordId || recordId, action: recordId ? 'updated' : 'created', electronicResume: !!payload['电子简历姓名'] });
    } catch (error) {
      summary.failed += 1;
      summary.results.push({ label, name: asText(candidate.name), status: 'failed', error: error.message || String(error) });
    }
  }

  const outputPath = join(args.outDir, 'boss-electronic-resume-sync-summary.json');
  writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');
  process.stdout.write(JSON.stringify({ ok: summary.failed === 0, outputPath, ...summary }, null, 2) + '\n');
  if (summary.failed > 0) process.exitCode = 2;
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, error: error.message || String(error) }, null, 2) + '\n');
  process.exit(1);
});
