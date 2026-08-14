---
name: opencli-boss-locked
description: Use when working with BOSS Zhipin / boss直聘 through OpenCLI, especially commands such as `opencli boss search`, `recommend`, `chatlist`, `chatmsg`, `detail`, `resume`, `send`, `greet`, `batchgreet`, `invite`, `mark`, or any request that must avoid OpenCLI creating a new zhipin.com tab and disturbing cookies/session state. Enforces a locked `site:boss` session and routes BOSS adapter calls through a wrapper that fails before running if no existing BOSS tab is bound.
---

# OpenCLI Boss Locked

## Purpose

Protect BOSS Zhipin browser sessions from accidental new-tab creation, raw `opencli boss ...` residual binding, repeated adapter navigation, and parallel command races. The BOSS adapter uses `site:boss` for persistent site sessions; if that session is not bound, OpenCLI may create a fresh zhipin.com tab, which can disturb cookies or invalidate the existing tab.

Verified stability finding: raw commands such as `opencli boss chatlist --limit 1 -f json --site-session persistent --keep-tab true` can make the live BOSS chat page hard-reload in this environment. The isolated trigger is not the BOSS API request itself and not `page.goto(...)`: even `opencli browser site:boss eval "document.title"` triggers a document reload. The OpenCLI path that touches the page through Browser Bridge `exec` / `page.evaluate` is the unsafe part. Treat BOSS as a just-in-time target: bind only for the command you are about to run, then detach immediately after the command completes; prefer Kimi WebBridge for stable live-page observation and BOSS page-context reads when available.

## Mandatory workflow

For any BOSS Zhipin OpenCLI operation:

1. Do not run `opencli boss ...` directly. Raw commands with `--site-session persistent --keep-tab true` have been observed to make the live BOSS page keep reloading. Only bypass this guard when the user explicitly asks for a controlled reproduction test.
2. Use `scripts/opencli-boss-locked.ps1` from this skill directory.
3. The wrapper must resolve `site:boss` to exactly one existing `zhipin.com` tab before it calls `opencli boss`.
4. If `site:boss` is currently unbound, the wrapper may first try `opencli browser site:boss bind` against the user's currently active Chrome tab, then re-check the bound URL.
5. If the wrapper still reports no valid BOSS tab, stop and tell the user to focus their existing BOSS tab and run:

```powershell
opencli browser site:boss bind
```

6. After binding, retry through the wrapper.
7. After every wrapped BOSS command, immediately run `opencli browser site:boss unbind` so the tab does not stay under long-lived debugger attachment.

## Command pattern

Use an absolute script path:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Administrator\.codex\skills\opencli-boss-locked\scripts\opencli-boss-locked.ps1" <boss-command> [args...]
```

Examples:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Administrator\.codex\skills\opencli-boss-locked\scripts\opencli-boss-locked.ps1" search "AI工程师 上海" --limit 10 -f json

powershell -ExecutionPolicy Bypass -File "C:\Users\Administrator\.codex\skills\opencli-boss-locked\scripts\opencli-boss-locked.ps1" chatlist -f json

powershell -ExecutionPolicy Bypass -File "C:\Users\Administrator\.codex\skills\opencli-boss-locked\scripts\opencli-boss-locked.ps1" detail <security-id> -f json
```

The wrapper appends these options when absent:

```powershell
--site-session persistent --keep-tab true
```

It refuses incompatible options such as `--site-session ephemeral` or `--keep-tab false`.

## Safety rules

- Treat BOSS write actions as external side effects: `send`, `greet`, `batchgreet`, `invite`, `mark`, `exchange`. Get user approval before running them unless already explicitly authorized in the current turn.
- Prefer read-only commands for exploration: `search`, `detail`, `recommend`, `joblist`, `chatlist`, `chatmsg`, `resume`, `stats`.
- Run BOSS adapter commands serially. The locked workflow reuses one `site:boss` tab, so parallel calls can race on the same page and return stale or duplicated candidate data. This is especially important for `resume`, `chatmsg`, `send`, `greet`, `batchgreet`, `invite`, `mark`, and `exchange`.
- Do not use `multi_tool_use.parallel` for multiple `opencli-boss-locked.ps1` invocations. Loop sequentially and wait for each command to finish before starting the next one.
- The wrapper contains a named process mutex for `site:boss`; keep it enabled. It is a final guardrail, not a substitute for writing the agent workflow serially.
- Avoid raw persistent Boss adapter sessions. Bind as late as possible and unbind immediately after each command completes. In this environment, direct `opencli boss chatlist --limit 1 -f json --site-session persistent --keep-tab true` hard-reloads the BOSS page because the adapter reaches BOSS through OpenCLI Browser Bridge `exec` / `page.evaluate`, and persistent keep-tab leaves that control state attached until unbound.
- If the user reports "the page stops reloading as soon as I disconnect OpenCLI debug", treat OpenCLI Browser Bridge page execution as the confirmed cause. Stabilize first with:

```powershell
opencli browser site:boss unbind
```

then retry the read command through the wrapper. Do not retry the same raw `opencli boss ... --keep-tab true` command.
- Avoid forcing page refreshes. The upstream Boss adapter calls `page.goto(...)` in many commands; frequent visible refreshes can look abusive and can disturb the session. This environment has a local patch in `%APPDATA%\npm\node_modules\@jackwener\opencli\clis\boss\utils.js` so `navigateToChat` / `navigateTo` skip `goto` when the active tab is already on `zhipin.com` or the target path. If OpenCLI is updated or reinstalled, re-check this patch before running large Boss jobs.
- Root-cause evidence to preserve: Kimi WebBridge direct XHR to `getBossFriendListV2.json` returned normally without changing `performance.timeOrigin`; OpenCLI `browser eval` with the same request changed `performance.timeOrigin` and removed an in-page probe; OpenCLI no-op eval `document.title` also changed `performance.timeOrigin`. Therefore the reload is caused by OpenCLI Browser Bridge `exec` / `evaluate` injection on BOSS, not by the business endpoint.
- Prefer batching reads logically: one `recommend --limit N`, then serial `resume` calls for only the needed candidates. Do not poll repeatedly or loop with short intervals.
- If the user reports cookie/session instability, first check binding with:

```powershell
opencli browser site:boss tab list
```

- If `site:boss` is bound to a non-BOSS URL, tell the user to focus the intended existing BOSS tab and re-run `opencli browser site:boss bind`.

## Resource

- `scripts/opencli-boss-locked.ps1`: preflight wrapper that blocks execution before the BOSS adapter can create a new tab.
- `scripts/patch-boss-adapter-navigation.ps1`: checks or reapplies the local Boss adapter patch that skips unnecessary `page.goto(...)` refreshes.

Check the navigation patch:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Administrator\.codex\skills\opencli-boss-locked\scripts\patch-boss-adapter-navigation.ps1" -Check
```
