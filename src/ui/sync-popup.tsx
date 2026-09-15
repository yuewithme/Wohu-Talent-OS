import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Icon } from './components';
import { type SyncSettings,type SyncState } from '../sync/contracts';
import { VERSION } from '../shared/contracts';
import { syncRpc,syncError } from './sync-rpc';
import './style.css';
interface Snapshot {settings:SyncSettings;state:SyncState;running:boolean;has_token:boolean}
function Popup(){
  const [s,set]=useState<Snapshot>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const refresh=()=>syncRpc<Snapshot>('STATUS').then(set).catch(e=>setError(e.message));
  useEffect(()=>{void refresh();const t=setInterval(()=>void refresh(),3000);return()=>clearInterval(t);},[]);
  async function action(name:string){setBusy(true);setError('');try{set(await syncRpc<Snapshot>(name));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const jobs=s?.state.jobs||[],done=jobs.filter(j=>j.status==='done').length,failed=jobs.filter(j=>j.status==='blocked').length;
  return <div className="popup-shell"><header className="app-header"><Brand/><button className="icon-button" aria-label="同步设置" onClick={()=>chrome.runtime.openOptionsPage()}><Icon name="settings"/></button></header><main className="popup-content">
    <div className="section-heading"><h1>简历自动归档</h1><span className="source-tag">v{VERSION}</span></div>
    <p className="helper">收到 BOSS 附件简历后自动保存到飞书多维表格。</p>
    <div className="notice neutral"><strong>{s?.settings.enabled?'自动同步已启用':'自动同步已暂停'}</strong><p>{s?.running?'正在扫描会话并处理附件':s?.state.last_error?syncError(s.state.last_error):s?.settings.enabled?'打开 BOSS 后自动开始，每 30 秒检查一次。':'可在同步设置中恢复。'}</p></div>
    <div className="sync-counts"><span><b>{done}</b> 已归档</span><span><b>{jobs.length-done-failed}</b> 处理中</span><span><b>{failed}</b> 需处理</span></div>
    <p className="helper">已扫描 {Object.values(s?.state.cursors||{}).filter(c=>c.done).length} / {s?.state.contacts.length||0} 个可访问会话。{s?.state.scope_note}</p>
    {s?.state.last_scan&&<p className="helper">最近检查：{new Date(s.state.last_scan).toLocaleString()}</p>}
    {error&&<div className="notice danger" role="alert">{syncError(error)}</div>}
    <div className="sync-actions"><button className="button secondary" disabled={busy||!s?.settings.enabled||s.running} onClick={()=>action('BACKFILL')}>扫描历史附件</button><button className="button secondary" disabled={busy||!failed||s?.running} onClick={()=>action('RETRY')}>重试失败任务</button></div>
    <section className="sync-jobs">{[...jobs].reverse().slice(0,30).map(j=><article key={j.key}><strong>{j.attachment.meta.candidate_name}</strong><p>{j.attachment.meta.filename}</p><small>{{pending:'等待下载',retry:'等待重试',syncing:'飞书处理中',done:'已归档',blocked:'需要处理'}[j.status]}</small>{j.error&&<p className="helper">{syncError(j.error)}</p>}{j.record_url&&/^https:\/\/[^/]+\.feishu\.cn\//.test(j.record_url)&&<a href={j.record_url} target="_blank" rel="noreferrer">在飞书查看</a>}</article>)}{!jobs.length&&<p className="empty-line">尚未发现附件简历</p>}</section>
  </main><footer className="app-footer"><span>所有可访问会话 · 附件去重</span><button className="text-button" onClick={()=>chrome.runtime.openOptionsPage()}>同步设置</button></footer></div>;
}
createRoot(document.getElementById('root')!).render(<Popup/>);
