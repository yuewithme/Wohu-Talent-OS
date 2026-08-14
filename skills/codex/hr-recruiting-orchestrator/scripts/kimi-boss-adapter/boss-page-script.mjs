import { PAGE_CORE_SCRIPT } from './boss-page-core.mjs';
import { PAGE_READ_COMMANDS_SCRIPT } from './boss-page-read-commands.mjs';
import { PAGE_WRITE_COMMANDS_SCRIPT } from './boss-page-write-commands.mjs';
import { PAGE_ROUTER_SCRIPT } from './boss-page-router.mjs';

const WRITE_COMMANDS = new Set(['send', 'greet', 'batchgreet', 'invite', 'mark', 'exchange']);

export function isWriteCommand(command) {
  return WRITE_COMMANDS.has(command);
}

export function buildBossPageScript(command, params) {
  const payload = JSON.stringify({ command, params });
  return `(() => {
    const input = ${payload};
    const command = input.command;
    const params = input.params || {};
${PAGE_CORE_SCRIPT}
${PAGE_READ_COMMANDS_SCRIPT}
${PAGE_WRITE_COMMANDS_SCRIPT}
${PAGE_ROUTER_SCRIPT}
  })()`;
}
