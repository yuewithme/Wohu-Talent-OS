# Kimi WebBridge BOSS benchmark

This reference records the current BOSS tool-selection evidence. It supersedes the older assumption that OpenCLI should be the default structured BOSS reader.

## Benchmark scope

Environment:

- BOSS page: existing logged-in recruiter chat page at `https://www.zhipin.com/web/chat/index`
- Kimi WebBridge: daemon and extension connected
- OpenCLI: 1.7.22, BOSS navigation patch present
- Test Base: `https://wohukeji.feishu.cn/base/TXuzbMxUHas61wsO891cPkOynnf`

Tested workflow:

1. Find the existing BOSS tab through Kimi.
2. Install a page-stability probe and capture `performance.timeOrigin`.
3. Fetch BOSS friend-list through Kimi page-context `fetch`.
4. Click and scrape the visible resume panel for 10 candidates.
5. Fetch chat history through Kimi page-context `fetch`.
6. Score candidates for the backend / AI content generation role.
7. Write 10 records into a new Feishu Base table.
8. Create 3 personalized Feishu interview documents and write their links back to Base.

## Results

- Friend-list count: 55
- Friend-list in-page fetch: about 122 ms
- Friend-list roundtrip: about 130 ms
- Resume scrape: 10 / 10 succeeded
- Average resume scrape latency: about 1907 ms per candidate
- Average chat-history request latency: about 45 ms
- Base rows written: 10
- Interview docs created: 3
- End-to-end workflow: about 29.2 seconds
- Reload check: no hard reload; `performance.timeOrigin` remained unchanged after the Kimi workflow

Artifacts in the originating workspace:

- `C:\Users\Administrator\Desktop\CodexProject\archive\2026-05\kimi-boss-benchmark\kimi-workflow-report.json`
- `C:\Users\Administrator\Desktop\CodexProject\archive\2026-05\kimi-boss-benchmark\kimi-workflow-candidates.json`

## Comparison with OpenCLI

OpenCLI is still useful as a generic CLI and guarded fallback, but the BOSS adapter is not the preferred reader in this environment.

Confirmed OpenCLI behavior:

- `opencli browser site:boss bind` alone does not hard-reload BOSS.
- `opencli browser site:boss eval "document.title"` hard-reloads BOSS.
- `opencli boss chatlist --limit 1 -f json --site-session persistent --keep-tab true` hard-reloads BOSS.
- Kimi page-context request to the same BOSS friend-list endpoint does not hard-reload BOSS.

Root-cause conclusion:

The unsafe trigger is OpenCLI Browser Bridge `exec` / `page.evaluate` on the BOSS page, not the BOSS business API and not candidate data.

## Current routing rule

Use this order for BOSS reads:

1. Kimi-backed reader for candidate list, chat history, visible resume panel, and page-state checks.
2. OpenCLI `opencli-boss-locked` only as fallback when Kimi is unavailable or when a specific OpenCLI-only adapter capability is needed.
3. Never run raw `opencli boss ... --site-session persistent --keep-tab true`.

BOSS write actions are still guarded external side effects:

- `send`
- `greet`
- `batchgreet`
- `invite`
- `mark`
- `exchange`

Get explicit confirmation for target, action, and content before any write action, regardless of whether the transport is Kimi or OpenCLI.

## Implementation notes

- Use Node or another UTF-8-safe runner for Kimi and lark-cli orchestration. PowerShell argument passing can corrupt Chinese JSON when passing inline `--json`; prefer `--json @relative-file.json`.
- For lark-cli file arguments, use a relative `@file.json` from the command working directory; absolute `@C:\...` paths are rejected.
- Store benchmark evidence locally, but avoid printing candidate PII in final summaries.
