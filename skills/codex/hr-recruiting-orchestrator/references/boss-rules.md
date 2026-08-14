# BOSS / OpenCLI rules

BOSS is a live recruiting system. Use a guarded, serial, just-in-time workflow.

Current verified browser-control finding: OpenCLI Browser Bridge page execution is unsafe on the live BOSS chat page in this environment. The isolated trigger is `exec` / `page.evaluate`, not the BOSS business API and not adapter `page.goto(...)`: a no-op `opencli browser site:boss eval "document.title"` hard-reloaded BOSS, while Kimi WebBridge direct XHR to the same BOSS friend-list endpoint did not. A full Kimi workflow test then read 55 chat candidates, scraped 10 visible resume panels, wrote 10 Base records, and created 3 interview documents without changing `performance.timeOrigin`.

## Required route

Use Kimi-backed reads first for BOSS candidate collection. Use `opencli-boss-locked` for every OpenCLI-based BOSS fallback. Do not run raw `opencli boss ...`; raw persistent keep-tab commands have been observed to trigger BOSS page reloads. Only bypass the guard for an explicit, controlled reproduction test.

Preferred command shape:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\opencli-boss-locked\boss.ps1" <command> [args...]
```

or use the wrapper path documented by `opencli-boss-locked`.

## Kimi WebBridge boundary

Use `scripts/kimi-boss.ps1` as the preferred recruiter-side BOSS adapter. It is backed by `kimi-webbridge` / Kimi WebBridge and covers stable recruiter reads plus dry-run write planning.

Good uses:

- Browser observation during diagnosis.
- Confirm the currently open BOSS tab and URL.
- Read visible page text when diagnosing whether the page is logged in, stuck, refreshing, or showing an error.
- Take screenshots or snapshots for UI-state verification.
- Inspect DOM/visible labels when OpenCLI output and the page disagree.
- Run recruiter read commands: `chatlist`, `chatmsg`, `resume`, `recommend`, `joblist`, `stats`, and `label-list`.

Do not use Kimi casually for BOSS write actions such as `send`, `greet`, `batchgreet`, `invite`, `mark`, or `exchange`; those still require explicit confirmation.

Reason: in this environment Kimi direct page-context XHR to BOSS succeeded without a hard reload, while OpenCLI `exec` / `evaluate` caused hard reloads even for a no-op eval. The local Kimi-backed adapter now preserves OpenCLI-like structured output for recruiter commands and Batch candidate collection; keep OpenCLI locked commands as a guarded fallback, not the first choice for long BOSS batches.

## Stability rules

- Ensure exactly one existing BOSS tab is focused/bound.
- Run commands serially.
- Default command shape:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\hr-recruiting-orchestrator\scripts\kimi-boss.ps1" chatlist --limit 20 -f json
```

- For stability evidence, use `-f object` and check `stable=true`.
- Do not keep raw OpenCLI Boss adapter sessions alive. Direct commands such as `opencli boss chatlist --limit 1 -f json --site-session persistent --keep-tab true` hard-reload the live BOSS page in this environment because the Boss adapter reaches BOSS through OpenCLI Browser Bridge `page.evaluate`.
- If the user reports page reloads, use Kimi snapshot/list-tabs only to observe the page state; immediately run `opencli browser site:boss unbind` to release OpenCLI control state before any more BOSS commands.
- Before a recruiting batch or after any OpenCLI update/reinstall, check the local BOSS navigation patch:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\opencli-boss-locked\scripts\patch-boss-adapter-navigation.ps1" -Check
```

- If the patch check fails, reapply it before running any OpenCLI fallback. This prevents repeated `page.goto(...)` calls, but it does not fix the deeper OpenCLI `exec` / `evaluate` reload trigger.
- If BOSS starts reloading, first stop the current command if it is still running, then run:

```powershell
opencli browser site:boss unbind
```

Then stop and re-check the page state. Do not repeat the same raw `opencli boss ... --keep-tab true` command; retry through `opencli-boss-locked` only after the page is stable.

## Read-only commands

These may be used for collection and analysis when the user has asked to process BOSS candidates:

- `chatlist`
- `chatmsg`
- `resume`
- `recommend`
- `joblist`
- `stats`
- `label-list`

Use reasonable limits. Avoid short-interval polling loops.

## Write/action commands

These are external side effects and require explicit confirmation in the current turn:

- `send`
- `greet`
- `batchgreet`
- `invite`
- `mark`
- `exchange`

Before executing, confirm:

- candidate identity or record id
- action type
- message text or invite details if applicable
- target job if relevant

After executing, write action result back to Base.

When using `scripts/kimi-boss.ps1`, write/action commands dry-run by default. Only add `--confirm` after the user explicitly approves the exact target, action, and content.

## Failure handling

- If no BOSS tab is bound, ask the user to focus the existing BOSS tab and bind it.
- If the wrapper reports a non-BOSS tab, stop; do not let OpenCLI create a new tab.
- If OpenCLI was just updated and BOSS commands fail with `ADAPTER_LOAD` or `Invalid or unexpected token`, do not keep retrying BOSS commands. First run `node --check` on the adapter files under `%APPDATA%\npm\node_modules\@jackwener\opencli\clis\boss`, restore or reinstall OpenCLI if syntax is broken, then reapply the navigation patch.
- If `opencli browser site:boss tab list` includes update notices or other non-JSON text before JSON, parse the first JSON payload instead of treating the wrapper as broken.
- If BOSS shows a business state such as already invited or phone request pending, record that business state instead of retrying blindly.
- Do not hide partial failures. Summaries must list failed candidates and reasons.

## Preflight checklist

Run these checks before long BOSS collection:

1. `opencli --version` succeeds.
2. `patch-boss-adapter-navigation.ps1 -Check` succeeds.
3. `node --check` passes for BOSS adapter JavaScript files.
4. `opencli browser site:boss tab list` can be parsed.
5. A single read-only smoke command through the locked wrapper succeeds, or fails safely without creating a new tab.
6. `opencli browser site:boss tab list` is empty after the command, proving the wrapper unbound the debugger session.
