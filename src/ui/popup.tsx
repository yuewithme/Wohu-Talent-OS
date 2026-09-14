import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type Bootstrap, type CandidateDetail, type Capture, type Draft, type ImportAction, type ImportStatus, type Job, type PendingImport } from '../shared/contracts';
import { safeError, AppError } from '../shared/errors';
import { safeRecordUrl, supportedActions } from '../shared/guards';
import { rpc } from '../shared/rpc';
import { Brand, CandidateCard, ErrorNotice, Icon } from './components';
import './style.css';

const actionLabels: Record<ImportAction,string> = { create_candidate_and_application: '新建候选人并关联岗位', link_existing_candidate_to_job: '关联已有候选人与岗位', update_existing_candidate: '更新已有资料并关联岗位', create_new_candidate: '确认不是同一人，新建候选人', merge_with_existing: '确认是同一人，合并本次资料' };
const reasonLabels: Record<string,string> = { boss_external_id: '已验证的 BOSS 身份相同', same_name: '姓名相同', same_company: '公司相同', same_current_title: '职位相同', phone_hash: '电话相同', email_hash: '邮箱相同', same_phone: '电话相同', same_email: '邮箱相同', unverified_external_id: '渠道标识相同，稳定性待验证' };
function Popup() {
  const [state,setState] = useState<Bootstrap>(), [busy,setBusy] = useState('正在准备工作区'), [error,setError] = useState<ReturnType<typeof safeError>>();
  const [draft,setDraft] = useState<Draft>(), [pending,setPending] = useState<PendingImport>(), [jobs,setJobs] = useState<Job[]>([]);
  const [keyword,setKeyword] = useState(''), [page,setPage] = useState(1), [total,setTotal] = useState(0), [jobId,setJobId] = useState('');
  const [action,setAction] = useState<ImportAction | ''>(''), [candidateId,setCandidateId] = useState(''), [confirmed,setConfirmed] = useState(false);
  const [details,setDetails] = useState<Record<string,CandidateDetail>>({}), [now,setNow] = useState(Date.now()), [note,setNote] = useState('');
  const [name,setName] = useState('');
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); setError(undefined); setNote(''); try { await fn(); } catch (e) { setError(safeError(e)); } finally { setBusy(''); } };
  async function bootstrap() {
    const next = await rpc<Bootstrap>('BOOTSTRAP'); setState(next); setDraft(next.draft); setPending(next.pending);
    if (next.auth_error) setError(next.auth_error);
    if (next.draft?.job) setJobId(next.draft.job.id);
    setName(next.draft?.capture.record.candidate.name??'');
  }
  useEffect(() => { void run('正在准备工作区', bootstrap); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!pending || ['success','failed'].includes(pending.status?.feishu_sync?.status ?? '')) return;
    const timer = setInterval(() => { void rpc<ImportStatus>('IMPORT_STATUS_REQUEST').then(status => { if (status) setPending(item => item ? { ...item, status } : item); }).catch(e => setError(safeError(e))); }, 15000);
    return () => clearInterval(timer);
  }, [pending?.body.import_id, pending?.status?.feishu_sync?.status]);
  const preview = draft?.preview;
  const actions = preview ? supportedActions(preview, state?.me?.permissions ?? []) : [];
  const expired = Boolean(draft && draft.expires_at <= now);
  const changed = Boolean(draft && state?.page.fingerprint && state.page.fingerprint !== draft.capture.context.fingerprint);
  const needsCandidate = ['link_existing_candidate_to_job','update_existing_candidate','merge_with_existing'].includes(action);
  const canRead = Boolean(state?.page.supported && (!state.settings.api_origin || state.authenticated && state.me?.permissions.includes('candidate:import')));
  const step = pending ? 3 : preview ? 2 : 1;
  async function read() { await run('正在读取当前页面文字', async () => {
    const capture = await rpc<Capture>('EXTRACT_CANDIDATE_REQUEST'); setDraft({ capture, expires_at: Date.now()+30*60_000 });
    setAction(''); setConfirmed(false); setCandidateId(''); setDetails({}); setJobs([]); setJobId('');
    setName(capture.record.candidate.name);
  }); }
  async function loadJobs(nextPage = 1) { await run('正在获取开放岗位', async () => {
    const result = await rpc<{ items: Job[]; total: number }>('GET_JOBS_REQUEST', { keyword, page: nextPage });
    setJobs(result.items.filter(job => job.status === 'open')); setTotal(result.total); setPage(nextPage);
  }); }
  async function checkDuplicate() { await run('正在检查重复候选人', async () => {
    const next = await rpc<Draft>('IMPORT_PREVIEW_REQUEST', { job_id: jobId }); setDraft(next); setAction(''); setCandidateId(''); setConfirmed(false); setDetails({});
  }); }
  async function commit() { await run('正在提交已确认的资料', async () => {
    if (!confirmed || !action) throw new AppError('DUPLICATE_REVIEW_REQUIRED');
    try { await rpc('IMPORT_COMMIT_REQUEST', { action, ...(needsCandidate ? { candidate_id: candidateId } : {}) }); }
    finally { await bootstrap(); }
  }); }
  const status = pending?.status, committed = status?.status === 'committed', sync = status?.feishu_sync?.status;
  const recordUrl = status?.feishu_sync?.record_url ? safeRecordUrl(status.feishu_sync.record_url) : undefined;

  return <div className="popup-shell">
    <header className="app-header"><Brand /><button className="icon-button" title="连接设置" aria-label="连接设置" onClick={() => chrome.runtime.openOptionsPage()}><Icon name="settings" /></button></header>
    <nav className="steps" aria-label="导入进度">{['读取简历','核对与查重','确认导入'].map((title,index) => <div className={step === index+1 ? 'active' : step > index+1 ? 'done' : ''} key={title}><span>{step>index+1 ? <Icon name="check" size={12} /> : `0${index+1}`}</span>{title}{index<2 && <i />}</div>)}</nav>
    <main className="popup-main" aria-busy={Boolean(busy)}>
      <ErrorNotice error={error} />
      {note && <div className="notice success" role="status">{note}</div>}
      {!state && <div className="loading-state"><span className="spinner" /><p>{busy || '工作区暂未加载'}</p>{!busy && <button className="button secondary" onClick={() => run('正在重新加载', bootstrap)}>重新加载</button>}</div>}
      {state && !draft && !pending && <>
        <div className="eyebrow">从一次可靠的读取开始</div><h1>把好的人才，<br />带进招聘流程。</h1><p className="intro">打开 BOSS 候选人详情，读取当前简历，<br />核对后再导入你的招聘系统。</p>
        <section className={`page-card ${state.page.supported ? 'ready' : ''}`}><div className="scan-icon"><Icon name="scan" size={28} /></div><div><strong>{state.page.supported ? '已识别候选人详情' : '等待候选人详情'}</strong><p>{state.page.supported ? '可读取当前页面中的可见资料' : new AppError(state.page.reason ?? 'UNSUPPORTED_PAGE').message}</p></div><span className={`status-dot ${state.page.supported ? 'online' : ''}`} /></section>
        {!state.settings.api_origin && <div className="local-hint"><Icon name="shield" size={16} /><p>当前为本地预览。连接招聘系统后，可选择岗位、检查重复并确认导入。</p></div>}
        <button className="button primary full" disabled={Boolean(busy) || !canRead} onClick={read}><Icon name="scan" />读取当前候选人<Icon name="arrow" /></button>
        <button className="text-button centered" disabled={Boolean(busy)} onClick={() => run('正在检测当前页面', bootstrap)}><Icon name="refresh" size={14} />重新检测页面</button>
        <div className="boundary"><Icon name="shield" size={15} /><span>主动读取 · 人工确认 · 资料可追溯</span></div>
      </>}
      {draft && !pending && <>
        <div className="section-heading"><div><div className="eyebrow">{preview ? 'REVIEW & CONFIRM' : 'CANDIDATE PREVIEW'}</div><h1 className="compact">{preview ? '核对本次导入' : '候选人预览'}</h1></div><button className="text-button" disabled={Boolean(busy)} onClick={read}><Icon name="refresh" size={14} />重新读取</button></div>
        {(expired || changed) && <div className="notice warning">{expired ? '本次预览已过期，请重新读取。' : '页面候选人已变化，请重新读取。'}</div>}
        <CandidateCard candidate={preview?.normalized_candidate ?? draft.capture.record.candidate} capturedAt={draft.capture.record.captured_at} warnings={draft.capture.warnings} />
        {draft.capture.coverage&&<p className="helper">{draft.capture.coverage.canvas==='captured'?'已覆盖当前详情的绘制区域，折叠内容见完整度说明':draft.capture.coverage.canvas==='partial'?'详情文字部分覆盖':'仅结构化资料，详情原文尚未捕获'} · 来源：{draft.capture.coverage.sources.join(' / ')}</p>}
        {(draft.capture.record.candidate.resume_text||draft.capture.dom_text)&&<details className="dom-text"><summary>查看采集原文</summary><pre>{draft.capture.record.candidate.resume_text||draft.capture.dom_text}</pre></details>}
        {!preview&&!draft.capture.record.candidate.name&&<form className="name-supplement" onSubmit={e=>{e.preventDefault();void run('正在保存补充姓名',async()=>{setDraft(await rpc<Draft>('SAVE_CANDIDATE_NAME',{name}));setNote('姓名已由你补充确认。');});}}><label className="field-label" htmlFor="candidate-name">补充候选人姓名<input id="candidate-name" value={name} onChange={e=>setName(e.target.value)} placeholder="如需导入，请对照页面填写姓名" required maxLength={100} disabled={Boolean(busy)}/></label><p className="helper">本次未读取到姓名，导入前请对照页面补充。</p><button className="button secondary" disabled={Boolean(busy)||!name.trim()}>确认姓名</button></form>}
        {!preview && <section className="job-section"><div className="section-heading"><h3>关联招聘岗位</h3><span className="required-label">导入前必选</span></div>
          {state?.authenticated ? <><form className="search-row" onSubmit={e => { e.preventDefault(); void loadJobs(); }}><label className="sr-only" htmlFor="job-search">搜索开放岗位</label><input id="job-search" placeholder="搜索岗位名称" value={keyword} onChange={e=>setKeyword(e.target.value)} maxLength={100} disabled={Boolean(busy)} /><button className="button secondary" disabled={Boolean(busy)} type="submit">{jobs.length ? '搜索' : '获取岗位'}</button></form>
            {jobs.length>0 && <label className="field-label" htmlFor="job-select">选择岗位<select id="job-select" value={jobId} onChange={e=>setJobId(e.target.value)} disabled={Boolean(busy)}><option value="">请选择一个开放岗位</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.name}{job.location ? ` · ${job.location}` : ''}</option>)}</select></label>}
            {total>20 && <div className="pagination"><button disabled={page===1 || Boolean(busy)} onClick={()=>loadJobs(page-1)}>上一页</button><span>第 {page} 页 · 共 {total} 个</span><button disabled={page*20>=total || Boolean(busy)} onClick={()=>loadJobs(page+1)}>下一页</button></div>}
            <button className="button primary full" disabled={!jobId || Boolean(busy) || expired || changed || !draft.capture.record.candidate.name} onClick={checkDuplicate}>检查重复候选人<Icon name="arrow" /></button></> : <div className="notice neutral"><p>连接招聘系统后，可查询岗位和重复候选人。</p><button className="text-button" onClick={()=>chrome.runtime.openOptionsPage()}>连接招聘系统<Icon name="arrow" size={14} /></button></div>}
        </section>}
        {preview && <section className="review-section"><div className="selected-job"><Icon name="file" /><div><small>关联岗位</small><strong>{draft.job?.name}</strong></div><button className="text-button" disabled={Boolean(busy)} onClick={()=>{setDraft({...draft,preview:undefined});setAction('');setConfirmed(false);}}>更换</button></div>
          <div className={`duplicate-banner ${preview.duplicate.status==='not_found'?'clear':'review'}`}><Icon name={preview.duplicate.status==='not_found'?'check':'file'} /><div><strong>{{not_found:'未发现重复候选人',possible:'发现疑似重复，请人工核对',confirmed:'已匹配到已有候选人',conflict:'身份存在冲突，暂不能导入'}[preview.duplicate.status]}</strong><p>{preview.duplicate.status==='not_found'?'请核对资料和岗位后确认导入。':'根据匹配证据和已有应聘记录判断。'}</p></div></div>
          {preview.duplicate.matches.map(match=><div className={`match-card ${candidateId===match.candidate_id?'selected':''}`} key={match.candidate_id}><label className="match-label"><input type="radio" name="candidate-match" value={match.candidate_id} checked={candidateId===match.candidate_id} disabled={Boolean(busy)} onChange={()=>{setCandidateId(match.candidate_id);setConfirmed(false);}} /><strong>{match.name}</strong><span>匹配置信度 {Math.round(match.confidence*100)}%</span></label><div className="match-reasons">{match.match_reason.map(reason=><span key={reason}>{reasonLabels[reason]??reason}</span>)}</div><button className="text-button" disabled={Boolean(busy)} onClick={()=>run('正在查询已有应聘记录',async()=>{const data=await rpc<CandidateDetail>('CANDIDATE_DETAIL_REQUEST',{candidate_id:match.candidate_id});setDetails(current=>({...current,[match.candidate_id]:data}));})}>查看资料与应聘记录<Icon name="chevron" size={12}/></button>{details[match.candidate_id] && <div className="match-details"><p>{[details[match.candidate_id].summary.city,details[match.candidate_id].summary.current_company,details[match.candidate_id].summary.current_title].filter(Boolean).join(' · ') || '暂无其他摘要'}</p>{details[match.candidate_id].applications.length ? details[match.candidate_id].applications.map(app=><p key={app.id}>{app.job_name}<span className="stage-tag">{app.current_stage}</span></p>) : <p>暂无应聘记录</p>}</div>}</div>)}
          <label className="field-label" htmlFor="import-action">本次处理方式<select id="import-action" value={action} disabled={Boolean(busy)} onChange={e=>{setAction(e.target.value as ImportAction);setConfirmed(false);}}><option value="">请选择处理方式</option>{actions.map(a=><option key={a} value={a}>{actionLabels[a]}</option>)}</select></label>
          {actions.length===0 && <p className="helper">当前匹配结果或账号权限不允许提交，请联系管理员。</p>}
          <label className="confirmation"><input type="checkbox" checked={confirmed} disabled={Boolean(busy)} onChange={e=>setConfirmed(e.target.checked)} /><span>我已核对候选人资料、关联岗位和处理方式，确认导入招聘系统。</span></label>
          <button className="button primary full" disabled={Boolean(busy)||!action||!confirmed||expired||changed||(needsCandidate&&!candidateId)} onClick={commit}>确认导入<Icon name="arrow" /></button>
          <p className="footnote">预览剩余 {Math.max(0,Math.ceil((draft.expires_at-now)/60000))} 分钟 · 提交后由招聘系统同步飞书</p>
        </section>}
      </>}
      {pending && <section className="result-section"><div className={`result-symbol ${committed?'':'pending'}`}><Icon name={committed?'check':'refresh'} size={36}/></div><div className="eyebrow">{committed?'IMPORT COMPLETE':'IMPORT STATUS'}</div><h1 className="compact">{committed?'候选人已导入':'正在确认导入结果'}</h1><p className="intro">{committed?'资料已保存至招聘系统。':'提交记录已保存，可查询状态或重试原请求。'}</p><div className="result-panel"><div><span>招聘系统</span><strong>{committed?'已入库':'结果待确认'}</strong></div><div><span>飞书同步</span><strong>{{pending:'等待同步',processing:'同步中',success:'同步成功',failed:'同步失败'}[sync??'pending']}</strong></div>{status?.candidate_id && <div className="identifier"><span>候选人编号</span><code>{status.candidate_id}</code></div>}<div className="identifier"><span>导入编号</span><code>{pending.body.import_id}</code></div></div>
        {sync==='failed' && <div className="notice warning"><p>候选人已入库，飞书同步失败。招聘系统将按后台策略重试；持续失败时请联系管理员。</p></div>}
        {recordUrl && <a className="button primary full" href={recordUrl} target="_blank" rel="noreferrer">打开飞书记录<Icon name="arrow" /></a>}
        <button className="button secondary full" disabled={Boolean(busy)} onClick={()=>run('正在查询导入状态',async()=>{const status=await rpc<ImportStatus>('IMPORT_STATUS_REQUEST');setPending(p=>p?{...p,status}:p);})}><Icon name="refresh" />刷新导入状态</button>
        {!committed && <button className="button secondary full" disabled={Boolean(busy)} onClick={()=>run('正在重试原提交',async()=>{try{await rpc('IMPORT_RETRY_REQUEST');}finally{await bootstrap();}})}>使用原请求重试</button>}
        {['committed','expired','commit_failed'].includes(status?.status??'') && <button className="text-button centered" disabled={Boolean(busy)} onClick={()=>run('正在准备下一份简历',async()=>{await rpc('DISMISS_IMPORT');await bootstrap();})}>继续读取下一位<Icon name="arrow" size={14}/></button>}
        <p className="footnote">可关闭弹窗，稍后重新打开查询结果。</p>
      </section>}
      {busy && state && <div className="busy-bar" role="status"><span className="spinner small"/>{busy}</div>}
      {error && state?.settings.diagnostics_enabled && state.authenticated && <button className="text-button" disabled={Boolean(busy)} onClick={()=>run('正在发送脱敏诊断',async()=>{await rpc('DIAGNOSTIC_REPORT');setNote('已发送脱敏诊断，不包含简历正文和联系方式。');})}>上报解析诊断</button>}
    </main>
    <footer className="app-footer"><span><i className={`status-dot ${state?.authenticated?'online':''}`} />{state?.authenticated ? state.me?.organization.name : '本地预览'}</span><button className="text-button" onClick={()=>chrome.runtime.openOptionsPage()}>{state?.authenticated ? state.me?.user.name : '连接招聘系统'}<Icon name="chevron" size={12}/></button></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Popup/>);
