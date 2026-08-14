#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const fieldSpecs = [
  { name: '电子简历姓名', description: 'BOSS 电子简历面板中的姓名，和附件简历解析结果分开存储。' },
  { name: '电子简历性别', description: 'BOSS 电子简历面板中的性别。' },
  { name: '电子简历年龄', description: 'BOSS 电子简历面板中的年龄。' },
  { name: '电子简历学历', description: 'BOSS 电子简历面板中的最高学历。' },
  { name: '电子简历工作年限', description: 'BOSS 电子简历面板中的经验/工作年限。' },
  { name: '电子简历活跃时间', description: 'BOSS 电子简历面板中的最近活跃时间。' },
  { name: '电子简历应聘职位', description: 'BOSS 当前沟通或应聘职位，来自电子简历/聊天侧职位信息。' },
  { name: '电子简历期望职位', description: 'BOSS 电子简历面板中的期望职位。' },
  { name: '电子简历期望城市', description: 'BOSS 电子简历面板中的期望城市。' },
  { name: '电子简历期望薪资', description: 'BOSS 电子简历面板中的期望薪资。' },
  { name: '电子简历当前/最近公司', description: 'BOSS 电子简历拆分出的当前或最近公司。' },
  { name: '电子简历当前/最近职位', description: 'BOSS 电子简历拆分出的当前或最近职位。' },
  { name: '电子简历工作经历', description: 'BOSS 电子简历面板中的工作经历明细。' },
  { name: '电子简历教育经历', description: 'BOSS 电子简历面板中的教育经历明细。' },
  { name: '电子简历项目经历', description: 'BOSS 电子简历面板中的项目经历明细；没有时留空。' },
  { name: '电子简历技能', description: 'BOSS 电子简历面板中的技能标签或技能摘要。' },
  { name: '电子简历原始JSON', description: 'BOSS 电子简历结构化原始 JSON，只存电子简历，不混入附件简历 PDF 文本。' },
  { name: '附件简历文件', type: 'attachment', description: '候选人上传的 PDF/Word 等附件简历文件；普通记录写入不要伪造附件值。' },
  { name: '附件简历文件名', description: '附件简历文件名。' },
  { name: '附件简历链接', style: { type: 'url' }, description: '附件简历下载或飞书在线文件链接。' },
  { name: '附件简历文本', description: '附件简历经 Codex pdf skill 解析后的全文或主要文本。' },
  { name: '附件简历摘要', description: '附件简历经 Codex pdf skill 解析后的结构化摘要。' },
  { name: '附件简历解析状态', description: '附件简历解析状态，如未下载、已解析、解析失败、无附件。' },
  { name: '简历来源说明', description: '说明本条记录当前使用的是电子简历、附件简历，或两者已合并评估。' },
];

function parseArgs(argv) {
  const args = { as: 'user', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '-BaseToken' || token === '--base-token' || token === '--BaseToken') {
      args.baseToken = argv[++i];
    } else if (token === '-TableId' || token === '--table-id' || token === '--TableId') {
      args.tableId = argv[++i];
    } else if (token === '-As' || token === '--as') {
      args.as = argv[++i];
    } else if (token === '-DryRun' || token === '--dry-run') {
      args.dryRun = true;
    }
  }
  if (!args.baseToken || !args.tableId) {
    throw new Error('Usage: ensure-recruiting-base-schema.ps1 -BaseToken <token> -TableId <table_id> [-DryRun]');
  }
  return args;
}

function runLark(args) {
  const script = process.platform === 'win32' && process.env.APPDATA
    ? join(process.env.APPDATA, 'npm', 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js')
    : '';
  const command = script && existsSync(script) ? 'node' : 'lark-cli';
  const finalArgs = script && existsSync(script) ? [script, ...args] : args;
  const result = spawnSync(command, finalArgs, { encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(output || `lark-cli failed with exit ${result.status}`);
  }
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`lark-cli returned non-JSON output: ${output.slice(0, 300)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fieldList = runLark([
    'base', '+field-list',
    '--base-token', args.baseToken,
    '--table-id', args.tableId,
    '--limit', '200',
    '--as', args.as,
  ]);

  const existing = new Set((fieldList.data?.fields || []).map(field => field.name));
  const results = [];

  for (const spec of fieldSpecs) {
    if (existing.has(spec.name)) {
      results.push({ name: spec.name, status: 'exists', action: 'skip' });
      continue;
    }

    const body = {
      type: spec.type || 'text',
      name: spec.name,
      description: spec.description,
    };
    if (spec.style) body.style = spec.style;

    const json = JSON.stringify(body);
    if (args.dryRun) {
      results.push({ name: spec.name, status: 'missing', action: 'dry-run', json });
      continue;
    }

    const created = runLark([
      'base', '+field-create',
      '--base-token', args.baseToken,
      '--table-id', args.tableId,
      '--json', json,
      '--as', args.as,
    ]);

    results.push({
      name: spec.name,
      status: 'created',
      action: 'field-create',
      field_id: created.data?.field?.id || '',
    });
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exit(1);
});
