import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateSchema, CaptureRecordSchema, SourceRecordSchema, type Preview } from '../src/shared/contracts';
import { apiOrigin, commitDecision, hostPattern, isBossUrl, safeRecordUrl, supportedActions, versionOlder } from '../src/shared/guards';
import { dateRange, education, email, experience, phone } from '../src/adapter/normalize';
import { canvasHeaderCandidate, cardCandidate, canvasLines, projectCard, resolveFields, type Glyph } from '../src/adapter/sources';
import { incomingAttachment,attachmentKey } from '../src/sync/contracts';

test('API 地址接受 HTTPS、本机服务及指定的 18083 入口，拒绝其他 HTTP 地址', () => {
  assert.equal(apiOrigin(' https://ats.example.com/ '), 'https://ats.example.com');
  assert.equal(apiOrigin('http://localhost:3001'), 'http://localhost:3001');
  assert.equal(apiOrigin('http://150.158.52.233:18083/'),'http://150.158.52.233:18083');
  for(const value of ['http://150.158.52.233','http://150.158.52.233:18084','http://150.158.52.233.evil.test:18083','http://150.158.52.233:18083/v1','http://user:secret@150.158.52.233:18083'])assert.throws(()=>apiOrigin(value));
  for (const value of ['http://ats.example.com','https://user:secret@ats.example.com','https://ats.example.com/api/v1','https://ats.example.com/?token=secret','https://ats.example.com/#token','https://www.zhipin.com','https://open.feishu.cn']) assert.throws(()=>apiOrigin(value));
  assert.equal(hostPattern('https://ats.example.com:8443'),'https://ats.example.com/*');
});
test('BOSS 与飞书链接拒绝相似域名、明文协议和脚本 URL', () => {
  assert.equal(isBossUrl('https://www.zhipin.com/web/chat/recommend'),true);
  for (const value of ['https://zhipin.com.evil.test','http://www.zhipin.com','javascript:alert(1)','https://evilzhipin.com']) assert.equal(isBossUrl(value),false);
  assert.equal(safeRecordUrl('https://tenant.feishu.cn/base/test'),'https://tenant.feishu.cn/base/test');
  assert.equal(safeRecordUrl('https://feishu.cn.evil.test/record'),undefined);
});
test('联系方式仅归一化完整值，屏蔽号码和未知学历保持空值', () => {
  assert.equal(phone('138****1234'),undefined); assert.equal(phone('+86 138 0013 8000'),'+8613800138000');
  assert.equal(email('A.User@EXAMPLE.COM'),'a.user@example.com'); assert.equal(email('a***@example.com'),undefined);
  assert.equal(experience('5年以上'),5); assert.equal(experience('应届生'),0); assert.equal(experience('工作经验未知'),undefined);
  assert.equal(education('硕士研究生'),'master'); assert.equal(education('待核实'),undefined);
  assert.deepEqual(dateRange('2021.05 - 至今'),{start_date:'2021-05',end_date:'present'});
  assert.deepEqual(dateRange('至今'),{end_date:'present'});
});
test('明确重复不能新建，目标必须来自当前预览匹配列表', () => {
  const preview: Preview = { import_id:'i1',status:'decision_required',duplicate:{status:'confirmed',matches:[{candidate_id:'c1',name:'测试人',confidence:1,match_reason:[]}]},allowed_actions:['create_new_candidate','link_existing_candidate_to_job'] };
  assert.deepEqual(supportedActions(preview,['candidate:import']),['link_existing_candidate_to_job']);
  assert.throws(()=>commitDecision(preview,['candidate:import'],'j1','create_new_candidate'));
  assert.throws(()=>commitDecision(preview,['candidate:import'],'j1','link_existing_candidate_to_job','unmatched'));
  assert.equal(commitDecision(preview,['candidate:import'],'j1','link_existing_candidate_to_job','c1').candidate_id,'c1');
});
test('疑似重复的合并要求独立权限和明确选择，保留内部确认字段策略', () => {
  const preview: Preview = { import_id:'i1',status:'decision_required',duplicate:{status:'possible',matches:[{candidate_id:'c1',name:'测试人',confidence:.8,match_reason:[]}]},allowed_actions:['create_new_candidate','merge_with_existing','create_candidate_and_application'] };
  assert.deepEqual(supportedActions(preview,['candidate:import']),['create_new_candidate']);
  assert.throws(()=>commitDecision(preview,['candidate:import','candidate:merge'],'j1','merge_with_existing'));
  assert.equal(commitDecision(preview,['candidate:import','candidate:merge'],'j1','merge_with_existing','c1').merge_policy,'prefer_internal_confirmed_fields');
  assert.equal(commitDecision(preview,['candidate:import'],'j1','create_new_candidate','c1').candidate_id,undefined);
});
test('多个强身份匹配与 conflict 均关闭提交动作', () => {
  const matches = ['c1','c2'].map(candidate_id=>({candidate_id,name:'测试人',confidence:1,match_reason:[]}));
  const preview: Preview = { import_id:'i',status:'decision_required',duplicate:{status:'confirmed',matches},allowed_actions:['link_existing_candidate_to_job'] };
  assert.deepEqual(supportedActions(preview,['candidate:import']),[]);
  preview.duplicate.status='conflict'; assert.deepEqual(supportedActions(preview,['candidate:import','candidate:merge']),[]);
});
test('来源契约拒绝空姓名、缺失采集时间和非 BOSS 数据，允许缺少身份与经历', () => {
  assert.equal(CandidateSchema.safeParse({name:'   '}).success,false);
  const record = { source:'boss',source_url:'https://www.zhipin.com/web/frame/c-resume/',captured_at:'2026-09-11T12:00:00Z',extractor_version:'boss-adapter-0.1.0',candidate:{name:'测试人'} };
  assert.deepEqual(SourceRecordSchema.parse(record).external_ids,{});
  assert.equal(SourceRecordSchema.safeParse({...record,captured_at:undefined}).success,false);
  assert.equal(SourceRecordSchema.safeParse({...record,source_url:'https://evil.test'}).success,false);
  const parsed = SourceRecordSchema.parse({...record,raw_payload:{hiddenPhone:'do-not-send'},external_ids:{securityId:'context-only'},verified:true});
  assert.equal('raw_payload' in parsed,false); assert.equal('verified' in parsed,false);
});
test('最低版本使用数值比较而非字符串排序，非法配置阻断', () => {
  assert.equal(versionOlder('0.9.0','0.10.0'),true); assert.equal(versionOlder('1.0.0','0.10.0'),false);
  assert.equal(versionOlder('0.1.0','0.1.0'),false); assert.throws(()=>versionOlder('0.1.0','bad'));
});
test('DOM 本地预览允许缺失姓名，导入契约仍阻止空姓名', () => {
  const source = {source:'boss',source_url:'https://www.zhipin.com/web/frame/recommend/',captured_at:'2026-09-11T12:00:00Z',extractor_version:'boss-adapter-0.1.0',candidate:{name:'',work_experiences:[{company:'测试公司',title:'工程师'}]}};
  assert.equal(CaptureRecordSchema.safeParse(source).success,true);
  assert.equal(SourceRecordSchema.safeParse(source).success,false);
  assert.equal(SourceRecordSchema.safeParse({...source,candidate:{...source.candidate,name:'人工确认姓名'}}).success,true);
});

test('列表响应只保留候选人字段，最近关注不会冒充本人期望',()=>{
  const card=projectCard({encryptGeekId:'candidate_1',geekCard:{geekName:'测试人',securityId:'do-not-retain',geekWorkYear:'5年以上',salary:'10-15K',expectPositionName:'工程师',expectLocationName:'无锡',viewExpect:{positionName:'工程师',locationName:'无锡',recentAttentionPositionExpect:true},geekWorks:[{company:'测试公司',positionName:'工程师',startDate:'2020.01',endDate:'',current:true,responsibility:'完整职责',workEmphasisList:['视频剪辑']} ]}});
  assert.equal('securityId' in card,false);
  const candidate=cardCandidate(card);
  assert.equal(candidate.expected_title,undefined);assert.equal(candidate.expected_salary,undefined);
  assert.equal(candidate.recent_interest?.title,'工程师');assert.equal(candidate.experience_description,'5年以上');
  assert.equal(candidate.work_experiences?.[0].description,'完整职责');assert.equal(candidate.current_company,'测试公司');
  card.viewExpect.recentAttentionPositionExpect=false;
  assert.equal(cardCandidate(card).expected_city,'无锡');
});

test('Resolver 排除其他候选人证据，空值不覆盖，来源冲突保留',()=>{
  const {candidate,evidence,conflicts}=resolveFields('A',[
    {subject:'A',field:'name',value:'甲',method:'runtime',confidence:.95,locator:'current.name'},
    {subject:'B',field:'name',value:'乙',method:'network',confidence:1,locator:'card.name'},
    {subject:'A',field:'name',value:'旧名',method:'dom',confidence:.8,locator:'name'},
    {subject:'A',field:'name',value:'',method:'network',confidence:1,locator:'card.name'},
  ]);
  assert.equal(candidate.name,'甲');assert.equal(evidence.length,2);assert.deepEqual(conflicts,['name']);
});

test('Canvas 逐字绘制按行坐标还原，不按跨行调用顺序拼接',()=>{
  const rows=canvasLines([{text:'乙',x:24,y:10,font:'14px sans-serif'},{text:'下',x:10,y:35,font:'14px sans-serif'},{text:'甲',x:10,y:10,font:'14px sans-serif'}]);
  assert.deepEqual(rows,['甲乙','下']);
});

test('详情明确标注的求职期望与求职状态独立于推荐卡推断标记',()=>{
  const glyphs:Glyph[]=[];
  for(const [text,x,y] of [['22岁 本科 离校-随时到岗',130,100],['求职期望',50,280],['无锡',134,280],['测试',184,280],['行业不限',234,280],['5-8K',312,280]] as const) {
    [...text].forEach((text,i)=>glyphs.push({text,x:x+i*14,y:y+(x===50?-2:0),font:x===50?'600 14px sans-serif':'14px sans-serif'}));
  }
  const expected={availability:'离校-随时到岗',expected_city:'无锡',expected_title:'测试',expected_salary:'5-8K'};
  assert.deepEqual(canvasHeaderCandidate(glyphs),expected);
  assert.deepEqual(canvasHeaderCandidate(glyphs.map(g=>({...g,x:g.x*2,y:g.y*2})),2),expected);
  const recent=glyphs.filter(g=>g.y!==278);
  [...'最近关注'].forEach((text,i)=>recent.push({text,x:50+i*14,y:280,font:'14px sans-serif'}));
  assert.equal(canvasHeaderCandidate(recent).expected_city,undefined);
  assert.equal(canvasHeaderCandidate(glyphs).city,undefined);
  assert.deepEqual(canvasHeaderCandidate([{text:'个人资料',x:50,y:60,font:'600 14px sans-serif'}]),{});
});

test('新采集契约保留多来源证据和全文，拒绝未知来源方法',()=>{
  const record={source:'boss',source_url:'https://www.zhipin.com/web/chat/recommend',captured_at:'2026-09-12T12:00:00Z',extractor_version:'boss-adapter-0.2.0',candidate:{name:'测试人',resume_text:'完整绘制文字',age:30,recent_interest:{title:'工程师'}},evidence:[{field:'candidate.name',value:'测试人',source:'boss',method:'runtime',confidence:.95,selector_version:'v2',subject_key:'candidate_1',locator:'base.name',captured_at:'2026-09-12T12:00:00Z'}]};
  assert.equal(SourceRecordSchema.parse(record).candidate.resume_text,'完整绘制文字');
  assert.equal(SourceRecordSchema.safeParse({...record,evidence:[{...record.evidence[0],method:'guessed'}]}).success,false);
});

test('消息附件只识别入站文件，排除其他候选人、在线卡片和发出的文件',()=>{
  const contact={friendId:123456,name:'测试人',jobName:'工程师',encryptUid:'candidate_123456',friendSource:0};
  const message={from:{uid:123456,name:'测试人'},to:{uid:654321},mid:123,time:1789373511566,body:{hyperLink:{hyperLinkType:9,text:'简历.pdf',url:'bosszp://bosszhipin.app/openwith?type=selectResumePreviewUrl&encryptId=resume_123456&authType=1'}}};
  const item=incomingAttachment(message,contact,'654321')!;
  assert.equal(item.meta.filename,'简历.pdf');assert.equal(item.encrypted_uid,'candidate_123456');
  assert.equal(attachmentKey(item.meta),'654321:123456:123:resume_123456');
  assert.equal(incomingAttachment({...message,from:message.to,to:message.from},contact,'654321'),undefined);
  assert.equal(incomingAttachment(message,{...contact,friendId:999999},'654321'),undefined);
  assert.equal(incomingAttachment({...message,body:{resume:{}}},contact,'654321'),undefined);
  assert.equal(incomingAttachment({...message,body:{hyperLink:{...message.body.hyperLink,url:'https://evil.test/file.pdf'}}},contact,'654321'),undefined);
});
