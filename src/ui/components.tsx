import type { ReactNode } from 'react';
import type { Candidate } from '../shared/contracts';

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    scan: <><path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4M4 12h16" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="16" cy="17" r="3" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></>,
    link: <><path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 1 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0) scale(.95)" /></>,
    file: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h5" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.file}</svg>;
}
export function Brand() { return <div className="brand"><span className="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m6 11 5 12 5-10 5 10 5-12" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" /></svg></span><div><strong>沃虎人才</strong><span>RECRUITING ASSISTANT</span></div></div>; }
export function ErrorNotice({ error }: { error?: { message: string; request_id?: string } }) { return error ? <div className="notice danger" role="alert"><strong>操作未完成</strong><p>{error.message}</p>{error.request_id && <small className="request-id">请求编号 · {error.request_id}</small>}</div> : null; }
export const educationLabels: Record<string, string> = { doctor: '博士', master: '硕士', bachelor: '本科', associate: '大专', high_school: '高中', secondary: '中专 / 中技', middle_school: '初中' };
const value = (v?: string | number) => v === undefined || v === '' ? '未读取到' : v;
function dates(item: { start_date?: string; end_date?: string }) { return [item.start_date, item.end_date === 'present' ? '至今' : item.end_date].filter(Boolean).join(' — '); }
export function CandidateCard({ candidate, capturedAt, warnings = [] }: { candidate: Candidate; capturedAt: string; warnings?: string[] }) {
  return <>
    <section className="candidate-card">
      <div className="candidate-top"><div className="avatar">{candidate.name.slice(0,1)||'人'}</div><div className="candidate-heading"><h2>{candidate.name||'候选人资料'}</h2><p>{candidate.current_title ?? candidate.expected_title ?? '当前候选人'}</p></div><span className="source-tag">BOSS</span></div>
      <div className="candidate-meta">{candidate.age&&<><span>{candidate.age} 岁</span><i /></>}<span>{value(candidate.city)}</span><i /> <span>{candidate.experience_description ?? (candidate.experience_years === undefined ? '年限未读取到' : `${candidate.experience_years} 年经验`)}</span><i /><span>{candidate.highest_education ? educationLabels[candidate.highest_education] ?? candidate.highest_education : '学历未读取到'}</span></div>
      {candidate.availability&&<p>{candidate.availability}</p>}
      <dl className="fields"><div><dt>当前公司</dt><dd>{value(candidate.current_company)}</dd></div><div><dt>期望岗位</dt><dd>{value(candidate.expected_title)}</dd></div><div><dt>期望城市</dt><dd>{value(candidate.expected_city)}</dd></div><div><dt>期望薪资</dt><dd>{value(candidate.expected_salary)}</dd></div>{candidate.phone && <div><dt>可见电话</dt><dd>{candidate.phone}</dd></div>}{candidate.email && <div><dt>可见邮箱</dt><dd>{candidate.email}</dd></div>}</dl>
      {Boolean(candidate.skills?.length) && <div className="tags">{candidate.skills?.map(skill => <span key={skill}>{skill}</span>)}</div>}
      {candidate.recent_interest&&<dl className="fields"><div><dt>{candidate.recent_interest.label||'最近关注'}</dt><dd>{[candidate.recent_interest.city,candidate.recent_interest.title,candidate.recent_interest.salary].filter(Boolean).join(' · ')}</dd></div></dl>}
      <div className="captured"><Icon name="check" size={13} />读取于 {new Date(capturedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 仅当前简历</div>
    </section>
    <section className="experience-section"><details><summary><span>工作经历 <b>{candidate.work_experiences?.length ?? 0}</b></span><Icon name="chevron" size={14} /></summary>{candidate.work_experiences?.length ? candidate.work_experiences.map((work,index) => <div className="timeline-item" key={index}><strong>{work.company ?? '公司未读取到'}</strong><p>{work.title}</p><small>{dates(work)}</small>{work.description && <p className="description">{work.description}</p>}{Boolean(work.skills?.length)&&<div className="tags">{work.skills?.map((skill,i)=><span key={i}>{skill}</span>)}</div>}</div>) : <p className="empty-line">未读取到工作经历</p>}</details>
      <details><summary><span>教育经历 <b>{candidate.educations?.length ?? 0}</b></span><Icon name="chevron" size={14} /></summary>{candidate.educations?.length ? candidate.educations.map((edu,index) => <div className="timeline-item" key={index}><strong>{edu.school ?? '学校未读取到'}</strong><p>{[edu.major, edu.degree].filter(Boolean).join(' · ')}</p><small>{dates(edu)}</small>{edu.description&&<p className="description">{edu.description}</p>}</div>) : <p className="empty-line">未读取到教育经历</p>}</details>
      {Boolean(candidate.projects?.length) && <details><summary><span>项目经历 <b>{candidate.projects?.length}</b></span><Icon name="chevron" size={14} /></summary>{candidate.projects?.map((project,index) => <div className="timeline-item" key={index}><strong>{project.name}</strong><p>{project.role}</p><small>{dates(project)}</small><p className="description">{project.description}</p></div>)}</details>}
      {candidate.personal_summary && <details><summary><span>个人简介</span><Icon name="chevron" size={14} /></summary><p className="description">{candidate.personal_summary}</p></details>}
    </section>
    {warnings.length > 0 && <details className="quality-note"><summary>数据完整度说明 · {warnings.length} 项</summary><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
  </>;
}
