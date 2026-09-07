"use client";

import { useState } from "react";

const baseUrl =
  "https://wohukeji.feishu.cn/base/TXuzbMxUHas61wsO891cPkOynnf?table=tblmOshUnosmnxbx&view=vew9317m0i";

const navItems = [
  { id: "overview", label: "总览", mark: "⌂" },
  { id: "pipeline", label: "招聘流程", mark: "↗" },
  { id: "candidates", label: "候选人库", mark: "人" },
  { id: "fields", label: "字段字典", mark: "#" },
] as const;

type Section = (typeof navItems)[number]["id"];

const stages = [
  { name: "岗位准备", note: "JD · 岗位画像 · 筛选条件", tone: "blue" },
  { name: "候选人采集", note: "BOSS 只读获取 · 来源留痕", tone: "cyan" },
  { name: "标准化入库", note: "字段映射 · 完整性检查", tone: "teal" },
  { name: "评分与排序", note: "岗位匹配 · 风险与亮点", tone: "green" },
  { name: "面试方案", note: "专属问题表 · 评分卡", tone: "violet" },
  { name: "HR 审核", note: "人工判断 · 明确下一步", tone: "amber" },
  { name: "候选人触达", note: "确认后执行 · 结果回写", tone: "rose" },
];

const fieldGroups = [
  {
    title: "候选人画像",
    fields: ["姓名", "当前职位/标题", "公司", "城市", "经验", "学历", "技能/标签"],
  },
  {
    title: "评估结论",
    fields: ["岗位匹配评分", "岗位匹配点评", "面试关注点", "信息完整性"],
  },
  {
    title: "流程管理",
    fields: ["流程状态", "专属面试问题表链接", "失败原因", "测试批次"],
  },
  {
    title: "来源与审计",
    fields: ["BOSS来源", "Kimi读取方式", "Kimi原始JSON", "采集耗时ms", "写入耗时ms"],
  },
];

const safetyRules = [
  "原飞书 Base 保持只读，不迁移候选人隐私数据",
  "BOSS 读取优先使用稳定页面通道，OpenCLI 仅作锁定回退",
  "发消息、打招呼、邀约、标记等写操作必须由 HR 明确确认",
  "电子简历与附件简历分开处理，来源和解析状态完整留痕",
];

const sourceSnapshot = {
  name: "BOSS-Kimi全流程测试-20260516",
  table: "Kimi全流程测试",
  batch: "kimi-boss-20260516092503",
  syncedAt: "2026-09-07",
  records: 10,
  fields: 20,
  views: 2,
  revision: 25,
};

const statusSummary = [
  { label: "已采集", count: 0, note: "等待进入评分" },
  { label: "已评分", count: 7, note: "等待生成面试题" },
  { label: "已生成面试题", count: 3, note: "进入 HR 审核" },
  { label: "失败", count: 0, note: "当前无异常记录" },
];

const processRecords = [
  { id: "01", status: "已评分", score: 0, completeness: 100, collectedMs: 122, writtenMs: null },
  { id: "02", status: "已生成面试题", score: 66, completeness: 100, collectedMs: 122, writtenMs: 1192 },
  { id: "03", status: "已生成面试题", score: 48, completeness: 100, collectedMs: 122, writtenMs: 1192 },
  { id: "04", status: "已生成面试题", score: 22, completeness: 100, collectedMs: 122, writtenMs: 1192 },
  { id: "05", status: "已评分", score: 8, completeness: 100, collectedMs: 122, writtenMs: null },
  { id: "06", status: "已评分", score: 0, completeness: 100, collectedMs: 122, writtenMs: null },
  { id: "07", status: "已评分", score: 8, completeness: 100, collectedMs: 122, writtenMs: null },
  { id: "08", status: "已评分", score: 22, completeness: 100, collectedMs: 122, writtenMs: null },
  { id: "09", status: "已评分", score: 22, completeness: 100, collectedMs: 122, writtenMs: null },
  { id: "10", status: "已评分", score: 22, completeness: 100, collectedMs: 122, writtenMs: null },
];

function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}

export default function Home() {
  const [active, setActive] = useState<Section>("overview");
  const [fieldQuery, setFieldQuery] = useState("");

  const filteredGroups = fieldGroups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) =>
        field.toLowerCase().includes(fieldQuery.trim().toLowerCase()),
      ),
    }))
    .filter((group) => group.fields.length > 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">W</div>
          <div>
            <strong>Wohu</strong>
            <span>Talent OS</span>
          </div>
        </div>

        <nav aria-label="工作台导航">
          <p className="nav-caption">工作台</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${active === item.id ? "active" : ""}`}
              onClick={() => setActive(item.id)}
              type="button"
            >
              <span className="nav-mark">{item.mark}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="source-state">
            <span className="pulse" />
            <div>
              <strong>飞书 Base</strong>
              <span>原始数据源 · 只读保护</span>
            </div>
          </div>
          <a href={baseUrl} target="_blank" rel="noreferrer" className="sidebar-link">
            打开原工作台 <ArrowIcon />
          </a>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-mark">W</div>
            <strong>Wohu Talent OS</strong>
          </div>
          <div className="topbar-copy">
            <span className="eyebrow">HR RECRUITING CONTROL ROOM</span>
            <span className="topbar-divider" />
            <span className="muted">Asia / Shanghai</span>
          </div>
          <div className="top-actions">
            <span className="status-pill"><i /> 已同步 REV {sourceSnapshot.revision}</span>
            <a href={baseUrl} target="_blank" rel="noreferrer" className="primary-button">
              进入飞书数据源 <ArrowIcon />
            </a>
          </div>
        </header>

        <div className="mobile-nav" aria-label="移动端导航">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={active === item.id ? "active" : ""}
              onClick={() => setActive(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="content">
          {active === "overview" && (
            <>
              <section className="hero">
                <div>
                  <div className="hero-kicker"><span /> RECRUITING SYSTEM · V1.0</div>
                  <h1>让每一次招聘决定，<br />都有据可循。</h1>
                  <p>
                    从岗位定义到候选人触达，把分散的判断沉淀成清晰、可审计、可复用的招聘系统。
                  </p>
                  <div className="hero-actions">
                    <button type="button" onClick={() => setActive("pipeline")} className="primary-button large">
                      查看招聘流程 <ArrowIcon />
                    </button>
                    <button type="button" onClick={() => setActive("fields")} className="ghost-button large">
                      浏览字段字典
                    </button>
                  </div>
                </div>
                <div className="hero-orbit" aria-label="流程概览图">
                  <div className="orbit-ring ring-one" />
                  <div className="orbit-ring ring-two" />
                  <div className="orbit-core">
                    <span>WOHU</span>
                    <strong>HR</strong>
                    <small>CONTROL</small>
                  </div>
                  <span className="orbit-node node-one">岗位</span>
                  <span className="orbit-node node-two">人才</span>
                  <span className="orbit-node node-three">面试</span>
                  <span className="orbit-node node-four">决策</span>
                </div>
              </section>

              <section className="metric-grid" aria-label="工作台结构指标">
                <article><span>候选人记录</span><strong>{sourceSnapshot.records}</strong><small>原 Base 当前记录数</small></article>
                <article><span>核心业务字段</span><strong>{sourceSnapshot.fields}</strong><small>覆盖画像、评分与审计</small></article>
                <article><span>招聘流程阶段</span><strong>07</strong><small>从岗位准备到安全触达</small></article>
                <article><span>流程状态</span><strong>04</strong><small>采集 · 评分 · 面试题 · 失败</small></article>
              </section>

              <section className="overview-grid">
                <article className="panel pipeline-preview">
                  <div className="panel-head">
                    <div><span className="eyebrow">PIPELINE</span><h2>招聘流程地图</h2></div>
                    <button type="button" onClick={() => setActive("pipeline")}>完整流程 <ArrowIcon /></button>
                  </div>
                  <div className="stage-strip">
                    {stages.slice(0, 5).map((stage, index) => (
                      <div className="stage-mini" key={stage.name}>
                        <span className={`stage-dot ${stage.tone}`}>{String(index + 1).padStart(2, "0")}</span>
                        <div><strong>{stage.name}</strong><small>{stage.note}</small></div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel guard-panel">
                  <span className="eyebrow">SAFETY GATE</span>
                  <div className="guard-icon">✓</div>
                  <h2>人工确认闸门已启用</h2>
                  <p>任何候选人触达动作都不会自动发生。系统在执行前要求确认对象、动作和内容。</p>
                  <div className="guard-tags"><span>不误触达</span><span>全过程留痕</span></div>
                </article>
              </section>
            </>
          )}

          {active === "pipeline" && (
            <section className="section-page">
              <div className="section-heading">
                <div><span className="eyebrow">RECRUITING PIPELINE</span><h1>端到端招聘流程</h1></div>
                <p>以飞书 Base 为业务主库，每个阶段都有明确输入、产出和安全边界。</p>
              </div>
              <div className="flow-list">
                {stages.map((stage, index) => (
                  <article className="flow-card" key={stage.name}>
                    <span className={`flow-index ${stage.tone}`}>{String(index + 1).padStart(2, "0")}</span>
                    <div><h2>{stage.name}</h2><p>{stage.note}</p></div>
                    <span className="flow-state">{index < 5 ? "系统辅助" : "人工决策"}</span>
                  </article>
                ))}
              </div>
              <article className="policy-card">
                <div><span className="eyebrow">POLICY</span><h2>流程安全策略</h2></div>
                <ul>{safetyRules.map((rule) => <li key={rule}><span>✓</span>{rule}</li>)}</ul>
              </article>
            </section>
          )}

          {active === "candidates" && (
            <section className="section-page">
              <div className="section-heading">
                <div><span className="eyebrow">CANDIDATE HUB</span><h1>候选人工作区</h1></div>
                <p>已将现有记录接入流程层；候选人隐私明细继续由飞书 Base 权限保护。</p>
              </div>
              <div className="privacy-hero">
                <div className="privacy-mark">{sourceSnapshot.records}</div>
                <div><span className="eyebrow">READ-ONLY SNAPSHOT · REV {sourceSnapshot.revision} · SYNCED {sourceSnapshot.syncedAt}</span><h2>现有记录已进入招聘流程</h2><p>{sourceSnapshot.name} · {sourceSnapshot.table} · {sourceSnapshot.fields} 个字段 · {sourceSnapshot.views} 个视图</p></div>
                <a href={baseUrl} target="_blank" rel="noreferrer" className="primary-button large">在飞书中查看 <ArrowIcon /></a>
              </div>
              <div className="status-grid">
                {statusSummary.map((status, index) => (
                  <article key={status.label}><span className={`status-number tone-${index + 1}`}>{String(status.count).padStart(2, "0")}</span><h3>{status.label}</h3><p>{status.note}</p></article>
                ))}
              </div>
              <section className="record-section" aria-label="已接入流程记录">
                <div className="record-section-head">
                  <div><span className="eyebrow">PROCESS SNAPSHOT</span><h2>全部 10 条流程记录</h2></div>
                  <span>批次 {sourceSnapshot.batch}</span>
                </div>
                <div className="record-grid">
                  {processRecords.map((record) => (
                    <article className="record-card" key={record.id}>
                      <div className="record-card-head"><span>流程记录 {record.id}</span><strong className={record.status === "已生成面试题" ? "ready" : "scored"}>{record.status}</strong></div>
                      <div className="record-score"><small>岗位匹配</small><b>{record.score}</b><span>/ 100</span></div>
                      <div className="record-meta"><span>信息完整性 {record.completeness}%</span><span>采集 {record.collectedMs}ms</span><span>{record.writtenMs ? `面试题写入 ${record.writtenMs}ms` : "待生成面试题"}</span></div>
                    </article>
                  ))}
                </div>
              </section>
              <div className="privacy-note"><span>盾</span><p><strong>隐私保护</strong> 姓名、简历、原始 JSON 和面试材料不会发布到此网页。访问真实候选人信息时，飞书会继续执行原有账号权限。</p></div>
            </section>
          )}

          {active === "fields" && (
            <section className="section-page">
              <div className="section-heading field-heading">
                <div><span className="eyebrow">DATA DICTIONARY</span><h1>字段字典</h1></div>
                <label className="field-search"><span>⌕</span><input value={fieldQuery} onChange={(event) => setFieldQuery(event.target.value)} placeholder="搜索 20 个核心字段" /></label>
              </div>
              <div className="field-grid">
                {filteredGroups.map((group, groupIndex) => (
                  <article className="field-group" key={group.title}>
                    <div className="field-group-head"><span>0{groupIndex + 1}</span><h2>{group.title}</h2><small>{group.fields.length} 个字段</small></div>
                    <div className="field-list">
                      {group.fields.map((field) => <div key={field}><span className="field-type">{field.includes("评分") || field.includes("耗时") || field.includes("完整性") ? "N" : field.includes("链接") ? "↗" : "T"}</span><strong>{field}</strong></div>)}
                    </div>
                  </article>
                ))}
              </div>
              {filteredGroups.length === 0 && <div className="empty-state">没有匹配字段，换个关键词试试。</div>}
            </section>
          )}
        </div>

        <footer>
          <span>Wohu Talent OS · HR Recruiting Workspace</span>
          <span>最新同步 {sourceSnapshot.syncedAt} · 原始 Base 保持不变 · 网页不承载候选人隐私数据</span>
        </footer>
      </section>
    </main>
  );
}
