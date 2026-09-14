import { useEffect,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand,Icon } from './components';
import { VERSION } from '../shared/contracts';
import { SYNC_DEFAULTS,type SyncSettings } from '../sync/contracts';
import { apiOrigin,hostPattern } from '../shared/guards';
import { syncRpc,syncError } from './sync-rpc';
import './style.css';
function Options(){
  const [s,set]=useState<SyncSettings>(SYNC_DEFAULTS),[hasToken,setHasToken]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{void syncRpc<{settings:SyncSettings;has_token:boolean}>('STATUS').then(r=>{set(r.settings);setHasToken(r.has_token);}).catch(e=>setNotice(syncError(e.message)));},[]);
  async function save(e:React.FormEvent){e.preventDefault();setNotice('');try{
    const origin=s.service_origin?apiOrigin(s.service_origin):'';
    const permission=origin?chrome.permissions.request({origins:[hostPattern(origin)]}):Promise.resolve(true);setBusy(true);if(!await permission)throw Error('HOST_PERMISSION_REQUIRED');
    const r=await syncRpc<{settings:SyncSettings;has_token:boolean}>('SAVE',{...s,service_origin:origin});set(r.settings);setHasToken(r.has_token);setNotice(s.enabled?'连接验证通过，自动同步已启用。':'设置已保存，同步已暂停。');
  }catch(e){setNotice(syncError((e as Error).message));}finally{setBusy(false);}}
  return <div className="settings-shell"><header><Brand/><span className="version-label">v{VERSION}</span></header><main className="settings-layout"><aside><h1>让收到的简历，<br/>自动进入飞书。</h1><p>每台电脑使用统一的同步服务。<br/>飞书应用密钥保留在服务端。</p></aside><section className="settings-card"><h2>自动同步设置</h2><p className="helper">管理员部署同步服务后，为使用者提供 HTTPS 地址和访问凭证。</p>{notice&&<div className="notice neutral" role="status">{notice}</div>}<form onSubmit={save}>
    <label className="field-label">同步服务地址<input type="url" required={s.enabled} value={s.service_origin} onChange={e=>set({...s,service_origin:e.target.value})} placeholder="https://resume.example.com" disabled={busy}/></label>
    <label className="field-label">访问凭证<input type="password" autoComplete="off" value={s.token} onChange={e=>set({...s,token:e.target.value})} placeholder={hasToken?'已保存，留空保留':'由管理员提供'} disabled={busy}/></label>
    <div className="setting-toggles"><label><span><strong>自动同步所有会话附件</strong><small>打开 BOSS 后自动打开一个后台消息标签页，用于扫描新附件。</small></span><input type="checkbox" checked={s.enabled} onChange={e=>set({...s,enabled:e.target.checked})}/></label><label><span><strong>包含历史附件</strong><small>读取平台可访问的会话历史，已归档文件不会重复入库。</small></span><input type="checkbox" checked={s.backfill} onChange={e=>set({...s,backfill:e.target.checked})}/></label></div>
    <p className="helper">访问凭证保存在本机扩展存储，不进入 BOSS 页面。暂停会停止新任务，服务端已接收任务继续处理。支持 PDF、Word、RTF、文本及图片附件，单份不超过 20 MB。</p>
    <button className="button primary" disabled={busy} type="submit">{busy?'验证中…':'保存设置'}<Icon name="arrow"/></button>
  </form></section></main></div>;
}
createRoot(document.getElementById('root')!).render(<Options/>);
