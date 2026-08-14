export const PAGE_READ_COMMANDS_SCRIPT = String.raw`
    async function runChatlist() {
      const limit = positive(params.limit, 20, 100);
      const page = positive(params.page, 1, 50);
      const jobId = params.jobId || params['job-id'] || '0';
      const friends = await fetchFriendList({ page, jobId });
      return friends.slice(0, limit).map(mapBossRow);
    }

    async function runRecommend() {
      const limit = positive(params.limit, 20, 100);
      const labelMap = await fetchLabelMap();
      const friends = await fetchRecommendList();
      return friends.slice(0, limit).map(f => ({
        name: f.name || '',
        job_name: f.jobName || '',
        last_time: f.lastTime || '',
        labels: (f.relationLabelList || []).map(id => labelMap[id] || String(id)).join(', '),
        uid: f.encryptUid || '',
        numeric_uid: f.uid || '',
        encrypt_uid: f.encryptUid || '',
        security_id: f.securityId || '',
        encrypt_job_id: f.encryptJobId || ''
      }));
    }

    async function runJoblist() {
      const data = await bossFetch('https://' + BOSS_DOMAIN + '/wapi/zpjob/job/chatted/jobList');
      const jobs = Array.isArray(data.zpData) ? data.zpData : [];
      return jobs.map(j => ({
        job_name: j.jobName || '',
        salary: j.salaryDesc || '',
        city: j.address || '',
        status: j.jobOnlineStatus === 1 ? '在线' : '已关闭',
        encrypt_job_id: j.encryptJobId || ''
      }));
    }

    async function runStats() {
      const jobs = await runJoblist();
      const stats = await bossFetch('https://' + BOSS_DOMAIN + '/wapi/zpchat/chatHelper/statistics', {
        allowNonZero: true
      });
      let friends = [];
      try { friends = await fetchFriendList({ page: 1 }); } catch {}
      const counts = {};
      for (const f of friends) counts[f.jobName || 'unknown'] = (counts[f.jobName || 'unknown'] || 0) + 1;
      const filtered = params.jobId || params['job-id']
        ? jobs.filter(j => j.encrypt_job_id === (params.jobId || params['job-id']))
        : jobs;
      const rows = filtered.map(j => ({
        ...j,
        total_chats: String(counts[j.job_name] || 0)
      }));
      if (!params.jobId && !params['job-id'] && rows.length > 0) {
        rows.push({
          job_name: '--- 总计 ---',
          salary: '',
          city: '',
          status: rows.length + ' 个职位',
          total_chats: String(stats.zpData?.totalFriendCount || 0),
          encrypt_job_id: ''
        });
      }
      return rows;
    }

    async function runChatmsg() {
      const uid = params.uid || params._?.[0];
      if (!uid) throw new Error('chatmsg requires uid');
      const page = positive(params.page, 1, 50);
      const friend = await findFriendByUid(uid, { maxPages: 5 });
      if (!friend) throw new Error('未找到该候选人');
      if (!friend.securityId) throw new Error('该聊天缺少 securityId，无法获取历史消息');
      const url = 'https://' + BOSS_DOMAIN + '/wapi/zpchat/boss/historyMsg?gid=' +
        encodeURIComponent(friend.uid) + '&securityId=' + encodeURIComponent(friend.securityId) +
        '&page=' + encodeURIComponent(page) + '&c=20&src=0';
      const data = await bossFetch(url);
      const messages = data.zpData?.messages || data.zpData?.historyMsgList || [];
      return messages.map(m => {
        const fromObj = m.from || {};
        const isSelf = typeof fromObj === 'object' ? fromObj.uid !== friend.uid : false;
        return {
          from: isSelf ? '我' : (typeof fromObj === 'object' ? fromObj.name : friend.name),
          type: TYPE_MAP[m.type] || ('其他(' + m.type + ')'),
          text: m.text || m.body?.text || m.body?.content || m.body?.showText || '',
          time: m.time ? formatTime(m.time) : ''
        };
      });
    }

    async function runResume() {
      const uid = params.uid || params._?.[0];
      if (!uid) throw new Error('resume requires uid');
      const friend = await findFriendByUid(uid, { maxPages: 5 });
      if (!friend) throw new Error('未找到该候选人，请确认 uid 是否正确');
      const mapElectronicResume = resume => {
        const raw = { ...resume };
        if (resume.full_resume_abstract) raw.full_resume_abstract = resume.full_resume_abstract;
        return ({
        ...resume,
        resume_source: 'electronic',
        '简历来源说明': '电子简历',
        '电子简历姓名': resume.name || '',
        '电子简历性别': resume.gender || '',
        '电子简历年龄': resume.age || '',
        '电子简历学历': resume.degree || '',
        '电子简历工作年限': resume.experience || '',
        '电子简历活跃时间': resume.active_time || '',
        '电子简历应聘职位': resume.job_chatting || friend.jobName || '',
        '电子简历期望职位': resume.expect || '',
        '电子简历期望城市': resume.expect_city || '',
        '电子简历期望薪资': resume.expect_salary || '',
        '电子简历当前/最近公司': resume.current_company || '',
        '电子简历当前/最近职位': resume.current_position || '',
        '电子简历工作经历': resume.work_history || '',
        '电子简历教育经历': resume.education || '',
        '电子简历项目经历': resume.project_history || '',
        '电子简历技能': resume.skills || '',
        '电子简历原始JSON': JSON.stringify(raw)
        });
      };
      const base = friendBaseResume(friend);
      let panel = {};
      if (clickCandidateInList(friend.uid)) {
        await wait(1200);
        const scrapedPanel = scrapeResumePanel(friend);
        if (!scrapedPanel.name || scrapedPanel.name === friend.name) panel = scrapedPanel;
      }
      const full = await loadOnlineResumeDataForFriend(friend);
      return [mapElectronicResume({ ...base, ...panel, ...full })];
    }

    async function runLabels() {
      const labels = await fetchLabelMap();
      return Object.entries(labels).map(([label_id, label]) => ({ label_id, label }));
    }

    function resolveLabel(input) {
      if (LABEL_MAP[input]) return LABEL_MAP[input];
      if (!Number.isNaN(Number(input))) return Number(input);
      const found = Object.entries(LABEL_MAP).find(([key]) => key.includes(input || ''));
      if (found) return found[1];
      throw new Error('未知标签: ' + input + '。可用标签: ' + Object.keys(LABEL_MAP).join(', '));
    }
`;
