import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the HR recruiting workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Wohu Talent OS · HR 招聘工作台<\/title>/i);
  assert.match(html, /让每一次招聘决定/);
  assert.match(html, /招聘流程/);
  assert.match(html, /候选人库/);
  assert.match(html, /字段字典/);
  assert.match(html, /原始数据源 · 只读保护/);
  assert.match(html, /wohukeji\.feishu\.cn\/base\/TXuzbMxUHas61wsO891cPkOynnf/);
  assert.doesNotMatch(html, /BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY/);
});

test("keeps field definitions and safety gates in source", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const fieldGroups = \[/);
  assert.match(page, /姓名/);
  assert.match(page, /岗位匹配评分/);
  assert.match(page, /专属面试问题表链接/);
  assert.match(page, /Kimi原始JSON/);
  assert.match(page, /必须由 HR 明确确认/);
  assert.match(layout, /HR 招聘工作台/);
  assert.match(layout, /summary_large_image/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
