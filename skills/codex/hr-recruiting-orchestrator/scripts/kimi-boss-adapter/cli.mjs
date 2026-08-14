#!/usr/bin/env node
import { KimiClient } from './kimi-client.mjs';
import { buildBossPageScript, isWriteCommand } from './boss-page-script.mjs';

const COMMANDS = [
  'status',
  'chatlist',
  'chatmsg',
  'resume',
  'recommend',
  'joblist',
  'stats',
  'label-list',
  'send',
  'greet',
  'batchgreet',
  'invite',
  'mark',
  'exchange',
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '-f' || token === '--format') {
      args.format = argv[index + 1] || 'json';
      index += 1;
      continue;
    }
    if (token.startsWith('--')) {
      const raw = token.slice(2);
      const [key, inlineValue] = raw.split(/=(.*)/s).filter(v => v !== undefined);
      if (inlineValue !== undefined) {
        args[key] = coerceValue(inlineValue);
      } else if (argv[index + 1] && !argv[index + 1].startsWith('-')) {
        args[key] = coerceValue(argv[index + 1]);
        index += 1;
      } else {
        args[key] = true;
      }
      continue;
    }
    args._.push(token);
  }
  return args;
}

function coerceValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function printHelp() {
  const text = `
Kimi BOSS Adapter（招聘端）

Usage:
  kimi-boss <command> [args...] [-f json|table|object]

Read commands:
  status
  chatlist [--page 1] [--limit 20] [--job-id 0]
  chatmsg <uid> [--page 1]
  resume <uid>
  recommend [--limit 20]
  joblist
  stats [--job-id <encrypt_job_id>]
  label-list

Write commands:
  send <uid> <text> [--confirm]
  greet <uid> [--text "..."] [--confirm]
  batchgreet [--limit 5] [--text "..."] [--job-id <id>] [--confirm]
  invite <uid> --time "2026-06-01 14:00" [--address "..."] [--contact "..."] [--confirm]
  mark <uid> <label> [--remove] [--confirm]
  exchange <uid> [--type phone|wechat] [--confirm]

Safety:
  Write commands are dry-run by default. Add --confirm only after the user explicitly approves.
`;
  process.stdout.write(text.trimStart());
}

function normalizeParams(command, args) {
  const params = { ...args };
  params.jobId = args.jobId || args['job-id'] || '';
  params.securityId = args.securityId || args['security-id'] || '';

  if (['chatmsg', 'resume', 'send', 'greet', 'invite', 'mark', 'exchange'].includes(command)) {
    params.uid = params.uid || args._[0];
  }
  if (command === 'send') {
    params.text = params.text || args._.slice(1).join(' ');
  }
  if (command === 'mark') {
    params.label = params.label || args._[1];
  }

  return params;
}

function formatRows(rows, format, meta) {
  if (format === 'object') {
    process.stdout.write(`${JSON.stringify({ ok: true, ...meta, rows }, null, 2)}\n`);
    return;
  }
  if (format === 'table') {
    console.table(rows);
    return;
  }
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}

async function main() {
  const [commandToken, ...rest] = process.argv.slice(2);
  if (!commandToken || commandToken === '-h' || commandToken === '--help' || commandToken === 'help') {
    printHelp();
    return;
  }

  const command = commandToken.toLowerCase();
  if (!COMMANDS.includes(command)) {
    throw new Error(`Unsupported command: ${command}. Supported: ${COMMANDS.join(', ')}`);
  }

  const args = parseArgs(rest);
  const format = args.format || 'json';
  const session = args.session || process.env.KIMI_BOSS_SESSION || 'boss-kimi-adapter';
  const active = args.active === true || args['active-tab'] === true;
  const params = normalizeParams(command, args);

  if (isWriteCommand(command) && params.confirm !== true) {
    params.confirm = false;
  }

  const client = new KimiClient({ session });
  const tab = await client.findBossTab({ active });
  const before = await client.evaluate('(() => ({url: location.href, title: document.title, timeOrigin: performance.timeOrigin}))()');
  const rows = await client.evaluate(buildBossPageScript(command, params));
  const after = await client.evaluate('(() => ({url: location.href, title: document.title, timeOrigin: performance.timeOrigin}))()');

  const outputRows = Array.isArray(rows) ? rows : [rows];
  formatRows(outputRows, format, {
    command,
    tab,
    stable: before.timeOrigin === after.timeOrigin,
    before,
    after,
    dryRun: isWriteCommand(command) && params.confirm !== true,
  });

  if (before.timeOrigin !== after.timeOrigin) {
    process.stderr.write('WARN: BOSS page timeOrigin changed during command; page reloaded.\n');
    process.exitCode = 3;
  }
}

main().catch(error => {
  const payload = { ok: false, error: error.message || String(error) };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
});
