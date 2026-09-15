import { useEffect,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand,Icon } from './components';
import { VERSION } from '../shared/contracts';
import { SYNC_DEFAULTS,type SyncSettings } from '../sync/contracts';
import { syncRpc,syncError } from './sync-rpc';
import './style.css';
function Options(){
  const [s,set]=useState<SyncSettings>(SYNC_DEFAULTS),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{void syncRpc<{settings:SyncSettings}>('STATUS').then(r=>set(r.settings)).catch(e=>setNotice(syncError(e.message)));},[]);
  async function save(e:React.FormEvent){e.preventDefault();setNotice('');setBusy(true);try{
    const r=await syncRpc<{settings:SyncSettings}>('SAVE',{enabled:s.enabled,backfill:s.backfill});set(r.settings);setNotice(s.enabled?'自动同步已启用。':'设置已保存，同步已暂停。');
  }catch(e){setNotice(syncError((e as Error).message));}finally{setBusy(false);}}
  return <div className="settings-shell"><header><Brand/><span className="version-label">v{VERSION}</span></header><main className="settings-layout"><aside><h1>打开 BOSS，<br/>简历自动归档。</h1><p>安装后即可使用，无需配置。<br/>保持 BOSS 登录，收到的附件简历会自动进入飞书。</p></aside><section className="settings-card"><h2>同步偏好</h2><p className="helper">自动同步和历史补录默认开启。你可以在这里暂停或调整扫描范围。</p>{notice&&<div className="notice neutral" role="status">{notice}</div>}<form onSubmit={save}>
    <div className="setting-toggles"><label><span><strong>自动同步所有会话附件</strong><small>打开 BOSS 后自动打开一个后台消息标签页，用于扫描新附件。</small></span><input type="checkbox" checked={s.enabled} onChange={e=>set({...s,enabled:e.target.checked})}/></label><label><span><strong>包含历史附件</strong><small>读取平台可访问的会话历史，已归档文件不会重复入库。</small></span><input type="checkbox" checked={s.backfill} onChange={e=>set({...s,backfill:e.target.checked})}/></label></div>
    <p className="helper">暂停会停止新任务，服务端已接收任务继续处理。支持 PDF、Word、RTF、文本及图片附件，单份不超过 20 MB。</p>
    <button className="button primary" disabled={busy} type="submit">{busy?'保存中…':'保存偏好'}<Icon name="arrow"/></button>
  </form></section></main></div>;
}
createRoot(document.getElementById('root')!).render(<Options/>);
