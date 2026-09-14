import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS, type Me, type Settings } from '../shared/contracts';
import { AppError, safeError } from '../shared/errors';
import { apiOrigin, hostPattern } from '../shared/guards';
import { rpc } from '../shared/rpc';
import { Brand, ErrorNotice, Icon } from './components';
import './style.css';

function Options() {
  const [settings,setSettings] = useState<Settings>(DEFAULT_SETTINGS), [token,setToken] = useState(''), [hasToken,setHasToken] = useState(false);
  const [busy,setBusy] = useState(true), [error,setError] = useState<ReturnType<typeof safeError>>(), [notice,setNotice] = useState('');
  useEffect(()=>{void rpc<{settings:Settings;has_token:boolean}>('GET_SETTINGS').then(data=>{setSettings(data.settings);setHasToken(data.has_token);}).catch(e=>setError(safeError(e))).finally(()=>setBusy(false));},[]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(undefined); setNotice('');
    try {
      const origin = settings.api_origin ? apiOrigin(settings.api_origin) : '';
      if (origin && !settings.org_id.trim()) throw new AppError('INVALID_SCHEMA');
      // Chrome requires this exact-origin permission request to originate in the Save click gesture.
      const grant = origin ? chrome.permissions.request({origins:[hostPattern(origin)]}) : Promise.resolve(true);
      setBusy(true);
      if (!await grant) throw new AppError('HOST_PERMISSION_REQUIRED');
      const result = await rpc<{settings:Settings;authenticated:boolean;me?:Me}>('SAVE_SETTINGS',{settings:{...settings,api_origin:origin},...(token.trim()?{token:token.trim().replace(/^Bearer\s+/i,'')}: {})});
      setSettings(result.settings); setToken(''); setHasToken(result.authenticated);
      setNotice(result.authenticated ? `已连接 ${result.me?.organization.name} · ${result.me?.user.name}` : '设置已保存。未登录时可以在本地预览候选人。');
    } catch (e) { setError(safeError(e)); } finally {setBusy(false);}
  }
  return <div className="settings-shell"><header><Brand/><span className="version-label">CHROME EXTENSION · v0.1.0</span></header><main className="settings-layout"><aside><div className="eyebrow">YOUR WORKSPACE</div><h1>连接你的<br/>招聘工作区。</h1><p>让当前页面的人才资料，<br/>进入团队统一的招聘流程。</p><div className="settings-promise"><Icon name="shield" size={24}/><strong>数据的每一步，都由你确认</strong><p>插件读取当前可见简历。<br/>预览与提交分开执行。</p></div></aside><section className="settings-card"><div className="section-heading"><h2>连接设置</h2><span className="source-tag">ATS BACKEND</span></div><p className="helper">填写企业招聘系统提供的连接信息。无需在插件中配置飞书密钥。</p><ErrorNotice error={error}/>{notice&&<div className="notice success" role="status">{notice}</div>}
      <form onSubmit={save}><label className="field-label" htmlFor="origin">招聘系统地址<input id="origin" type="url" placeholder="https://ats.example.com" value={settings.api_origin} onChange={e=>setSettings({...settings,api_origin:e.target.value})} disabled={busy} autoComplete="off"/></label><p className="helper">填写服务根地址，不包含 /api/v1。未接入后端时可以留空。</p><label className="field-label" htmlFor="org">组织 ID<input id="org" placeholder="由企业管理员提供" value={settings.org_id} onChange={e=>setSettings({...settings,org_id:e.target.value})} disabled={busy} maxLength={160} autoComplete="off"/></label><label className="field-label" htmlFor="token">访问令牌<span className="optional">{hasToken?'当前会话已登录，留空保留':'Bearer Token'}</span><input id="token" type="password" placeholder={hasToken?'已登录，输入可更换令牌':'粘贴招聘系统的访问令牌'} value={token} onChange={e=>setToken(e.target.value)} disabled={busy} maxLength={16000} autoComplete="off" spellCheck={false}/></label><p className="helper">令牌只保存到浏览器当前会话，不进入 BOSS 页面，重启浏览器后需要重新登录。</p>
      <div className="setting-toggles"><label><span><strong>启用候选人读取</strong><small>可随时暂停插件的页面读取功能</small></span><input type="checkbox" checked={settings.adapter_enabled} onChange={e=>setSettings({...settings,adapter_enabled:e.target.checked})} disabled={busy}/></label><label><span><strong>允许发送脱敏诊断</strong><small>仅在点击上报时发送字段命中情况与错误码</small></span><input type="checkbox" checked={settings.diagnostics_enabled} onChange={e=>setSettings({...settings,diagnostics_enabled:e.target.checked})} disabled={busy}/></label></div>
      <div className="settings-actions"><button className="button primary" disabled={busy} type="submit">{busy?'正在处理…':'保存并验证连接'}<Icon name="arrow"/></button>{hasToken&&<button className="text-button" type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await rpc('SIGN_OUT');setHasToken(false);setToken('');setNotice('已退出当前登录，待确认的导入编号仍保留。');}catch(e){setError(safeError(e));}finally{setBusy(false);}}}>退出登录</button>}</div></form></section></main><footer className="settings-footer">WOHU TALENT <span>读取当前页面 · 不自动触达候选人</span></footer></div>;
}
createRoot(document.getElementById('root')!).render(<Options/>);
