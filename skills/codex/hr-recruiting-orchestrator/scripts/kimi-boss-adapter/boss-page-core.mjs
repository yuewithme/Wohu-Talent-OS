export const PAGE_CORE_SCRIPT = String.raw`
    const BOSS_DOMAIN = 'www.zhipin.com';
    const LABEL_MAP = {
      '新招呼': 1, '沟通中': 2, '已约面': 3, '已获取简历': 4,
      '已交换电话': 5, '已交换微信': 6, '不合适': 7, '牛人发起': 8, '收藏': 11
    };
    const TYPE_MAP = {
      1: '文本', 2: '图片', 3: '招呼', 4: '简历', 5: '系统',
      6: '名片', 7: '语音', 8: '视频', 9: '表情'
    };

    function wait(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function positive(value, fallback, max = 100) {
      const n = Number.parseInt(value ?? fallback, 10);
      if (!Number.isFinite(n) || n <= 0) return fallback;
      return Math.min(n, max);
    }

    function assertOk(data, prefix = 'Boss API') {
      if (!data || typeof data !== 'object') throw new Error(prefix + ' returned malformed response');
      if (data.code === 0) return;
      const message = data.message || data.zpMsg || data.msg || 'Unknown error';
      throw new Error(prefix + ': ' + message + ' (code=' + data.code + ')');
    }

    function bossFetch(url, opts = {}) {
      const method = opts.method || 'GET';
      const body = opts.body || null;
      const timeout = opts.timeout || 15000;
      const allowNonZero = opts.allowNonZero === true;

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.withCredentials = true;
        xhr.timeout = timeout;
        xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
        if (method !== 'GET') {
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
          xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        }
        xhr.onload = () => {
          try {
            const text = xhr.responseText || '';
            const data = text ? JSON.parse(text) : {};
            if (!allowNonZero) assertOk(data);
            resolve(data);
          } catch (error) {
            reject(error);
          }
        };
        xhr.onerror = () => reject(new Error('Network error: ' + url));
        xhr.ontimeout = () => reject(new Error('Timeout: ' + url));
        xhr.send(body);
      });
    }

    function formatTime(ms) {
      if (!ms) return '';
      try { return new Date(ms).toLocaleString('zh-CN'); } catch { return ''; }
    }

    function mapBossRow(f) {
      return {
        name: f.name || '',
        company: '',
        job: f.jobName || '',
        title: '',
        last_msg: f.lastMessageInfo?.text || f.lastMessageInfo?.showText || '',
        last_time: f.lastTime || '',
        uid: f.encryptUid || '',
        numeric_uid: f.uid || '',
        security_id: f.securityId || '',
        encrypt_job_id: f.encryptJobId || ''
      };
    }

    async function fetchFriendList(options = {}) {
      const page = positive(options.page, 1, 50);
      const jobId = options.jobId || '0';
      const allowNonZero = options.allowNonZero === true;
      const url = 'https://' + BOSS_DOMAIN + '/wapi/zprelation/friend/getBossFriendListV2.json?page=' +
        encodeURIComponent(page) + '&status=0&jobId=' + encodeURIComponent(jobId);
      const data = await bossFetch(url, { allowNonZero });
      if (allowNonZero && data.code !== 0) return data;
      const list = data.zpData?.friendList;
      if (!Array.isArray(list)) throw new Error('Boss friend list response missing zpData.friendList');
      return list;
    }

    async function fetchRecommendList() {
      const data = await bossFetch('https://' + BOSS_DOMAIN + '/wapi/zprelation/friend/greetRecSortList');
      const list = data.zpData?.friendList;
      if (!Array.isArray(list)) throw new Error('Boss recommend response missing zpData.friendList');
      return list;
    }

    async function fetchLabelMap() {
      const data = await bossFetch('https://' + BOSS_DOMAIN + '/wapi/zprelation/friend/label/get', {
        allowNonZero: true
      });
      const labelMap = {};
      if (data.code === 0 && Array.isArray(data.zpData?.labels)) {
        for (const label of data.zpData.labels) {
          labelMap[label.labelId] = label.label;
        }
      }
      return labelMap;
    }

    async function findFriendByUid(encryptUid, options = {}) {
      const maxPages = positive(options.maxPages, 5, 20);
      const allowNonZero = options.allowNonZero === true;
      for (let page = 1; page <= maxPages; page += 1) {
        const result = await fetchFriendList({ page, allowNonZero: true });
        if (Array.isArray(result)) {
          const found = result.find(f => f.encryptUid === encryptUid || String(f.uid) === String(encryptUid));
          if (found) return allowNonZero ? { friend: found, code: 0 } : found;
        } else if (result.code && result.code !== 0) {
          if (allowNonZero) return result;
          assertOk(result);
        }
      }
      if (options.checkGreetList) {
        const list = await fetchRecommendList();
        const found = list.find(f => f.encryptUid === encryptUid || String(f.uid) === String(encryptUid));
        if (found) return allowNonZero ? { friend: found, code: 0 } : found;
      }
      return allowNonZero ? { friend: null, code: 0 } : null;
    }

    function clickCandidateInList(numericUid) {
      const uid = String(numericUid || '').replace(/[^0-9]/g, '');
      const selectors = ['.friend-list .friend-item', '.geek-list .geek-item', '.geek-item', '[data-uid]'];
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          const text = el.textContent || '';
          const attrs = [el.getAttribute('data-uid'), el.getAttribute('data-id'), el.dataset?.uid].filter(Boolean);
          if (attrs.includes(uid) || (uid && text.includes(uid))) {
            el.click();
            return true;
          }
        }
      }
      for (const el of document.querySelectorAll('.geek-item')) {
        if ((el.outerHTML || '').includes(uid)) {
          el.click();
          return true;
        }
      }
      return false;
    }

    function closeOnlineResumeDialog() {
      const close = document.querySelector('.resume-container .close-btn, .boss-dialog__wrapper .close-btn');
      if (close) close.click();
    }

    function ensureOnlineResumeListener() {
      window.__kimiBossResumeMessages = [];
      if (window.__kimiBossResumeListenerInstalled) return;
      window.addEventListener('message', event => {
        const data = event?.data;
        if (!data || !['IFRAME_DONE', 'WASM_ERROR', 'WASM_INIT_ERROR'].includes(data.type)) return;
        window.__kimiBossResumeMessages.push({ time: Date.now(), data });
      });
      window.__kimiBossResumeListenerInstalled = true;
    }

    async function waitForOnlineResumeData(timeout = 8000) {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const messages = window.__kimiBossResumeMessages || [];
        const done = messages.find(item => item.data?.type === 'IFRAME_DONE' && item.data?.data?.abstractData);
        if (done) return done.data.data.abstractData;
        const error = messages.find(item => ['WASM_ERROR', 'WASM_INIT_ERROR'].includes(item.data?.type));
        if (error) return { __error: error.data?.data?.message || error.data?.type };
        await wait(250);
      }
      return null;
    }

    function safeList(value) {
      return Array.isArray(value) ? value : [];
    }

    function formatWorkExp(list) {
      return safeList(list).map(item => [
        [item.startYearMonStr || item.startDateDesc, item.endYearMonStr || item.endDateDesc].filter(Boolean).join('-'),
        [item.company, item.positionName || item.roleName].filter(Boolean).join(' · '),
        item.workYearDesc ? '(' + item.workYearDesc + ')' : ''
      ].filter(Boolean).join('  ')).filter(Boolean);
    }

    function formatEduExp(list) {
      return safeList(list).map(item => [
        [item.startDateDesc, item.endDateDesc].filter(Boolean).join('-'),
        [item.school, item.major, item.degreeName].filter(Boolean).join(' · ')
      ].filter(Boolean).join('  ')).filter(Boolean);
    }

    function formatProjectExp(list) {
      return safeList(list).map(item => [
        [item.startDateDesc, item.endDateDesc].filter(Boolean).join('-'),
        [item.name, item.roleName].filter(Boolean).join(' · '),
        item.workYearDesc ? '(' + item.workYearDesc + ')' : ''
      ].filter(Boolean).join('  ')).filter(Boolean);
    }

    function deriveDegree(list) {
      const degrees = ['博士', '硕士', '本科', '大专', '高中', '中专', '中技', '初中'];
      const found = safeList(list).map(item => item.degreeName || '').find(name => degrees.includes(name));
      return found || '';
    }

    function extractSkillsFromAbstract(data) {
      const words = safeList(data?.highLightGeekResumeWords)
        .map(item => typeof item === 'string' ? item : (item?.word || item?.text || item?.name || ''))
        .filter(Boolean);
      return [...new Set(words)].join(', ');
    }

    function pickAbstractData(data) {
      if (!data || data.__error) return {};
      const base = data.geekBaseInfo || {};
      const workHistory = formatWorkExp(data.geekWorkExpList);
      const education = formatEduExp(data.geekEduExpList);
      const projectHistory = formatProjectExp(data.geekProjExpList);
      const firstWork = safeList(data.geekWorkExpList)[0] || {};
      return {
        name: base.name || '',
        gender: base.gender === 1 ? '男' : (base.gender === 2 ? '女' : ''),
        degree: deriveDegree(data.geekEduExpList),
        active_time: base.activeTimeDesc || '',
        current_company: firstWork.company || '',
        current_position: firstWork.positionName || '',
        work_history: workHistory.join('\\n') || '(电子简历未填写工作经历)',
        education: education.join('\\n') || '(电子简历未填写教育经历)',
        project_history: projectHistory.join('\\n') || '(电子简历未填写项目经历)',
        skills: extractSkillsFromAbstract(data) || '(电子简历未单独填写技能)',
        full_resume_abstract: {
          geekBaseInfo: data.geekBaseInfo || null,
          geekWorkExpList: data.geekWorkExpList || [],
          geekEduExpList: data.geekEduExpList || [],
          geekProjExpList: data.geekProjExpList || [],
          highLightGeekResumeWords: data.highLightGeekResumeWords || null,
          showExpectPosition: data.showExpectPosition || null,
          resumeSource: data.resumeSource || ''
        }
      };
    }

    function friendBaseResume(friend) {
      return {
        name: friend?.name || '',
        job_chatting: friend?.jobName || '',
        current_company: '',
        current_position: '',
        work_history: '',
        education: '',
        project_history: '',
        skills: ''
      };
    }

    async function getOnlineResumeFrame() {
      const cached = window.__kimiBossResumeFrame;
      if (cached?.isConnected && cached.contentWindow) return cached;
      const iframe = document.createElement('iframe');
      iframe.src = '/web/frame/c-resume/?source=chat-resume-online';
      iframe.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1084px;height:1200px;opacity:0;pointer-events:none;';
      document.body.appendChild(iframe);
      await new Promise(resolve => {
        iframe.onload = resolve;
        setTimeout(resolve, 3000);
      });
      window.__kimiBossResumeFrame = iframe;
      return iframe;
    }

    async function loadOnlineResumeDataForFriend(friend) {
      if (!friend?.encryptUid || !friend?.securityId || !friend?.encryptJobId) return {};
      const connectionId = 'kimi-boss-resume-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const messages = [];
      const listener = event => {
        const data = event?.data;
        if (data?.connectionId === connectionId) messages.push(data);
      };
      window.addEventListener('message', listener);
      const iframe = await getOnlineResumeFrame();
      try {
        iframe.contentWindow?.postMessage({
          type: 'SET_RESUME',
          connectionId,
          data: {
            dataSourceParams: { resumeSource: 'chat-resume-online' },
            requestParams: {
              encryptJid: friend.encryptJobId,
              securityId: friend.securityId,
              uid: friend.encryptUid,
              scene: 0,
              source: 1
            }
          }
        }, '*');
        const started = Date.now();
        while (Date.now() - started < 10000) {
          const done = messages.find(item => item.type === 'IFRAME_DONE' && item.data?.abstractData);
          if (done) return pickAbstractData(done.data.abstractData);
          const error = messages.find(item => ['WASM_ERROR', 'WASM_INIT_ERROR'].includes(item.type));
          if (error) {
            if (/memory|WebAssembly/i.test(error.data?.message || '')) {
              window.__kimiBossResumeFrame = null;
              iframe.remove();
            }
            return { warning: error.data?.message || error.type };
          }
          await wait(250);
        }
        return { warning: '在线简历详情读取超时' };
      } finally {
        window.removeEventListener('message', listener);
      }
    }

    async function scrapeOnlineResumeDetail() {
      const button = document.querySelector('.resume-btn-online') ||
        [...document.querySelectorAll('a,button,div')].find(el => /^\\s*在线简历\\s*$/.test(el.textContent || ''));
      if (!button) return {};
      ensureOnlineResumeListener();
      closeOnlineResumeDialog();
      await wait(500);
      window.__kimiBossResumeMessages = [];
      button.click();
      const data = await waitForOnlineResumeData();
      closeOnlineResumeDialog();
      await wait(300);
      return pickAbstractData(data);
    }

    function scrapeResumePanel(friend) {
      const container = document.querySelector('.base-info-single-container') ||
        document.querySelector('.base-info-content') ||
        document.querySelector('.resume-detail') ||
        document.body;

      const name = container.querySelector?.('.base-name')?.textContent?.trim() || friend?.name || '';
      let gender = '';
      const detailDiv = container.querySelector?.('.base-info-single-detial');
      if (detailDiv) {
        for (const use of detailDiv.querySelectorAll('use')) {
          const href = use.getAttribute('xlink:href') || use.getAttribute('href') || '';
          if (href.includes('icon-men')) gender = '男';
          if (href.includes('icon-women')) gender = '女';
        }
      }

      let age = '', experience = '', degree = '';
      if (detailDiv) {
        for (const el of detailDiv.children) {
          const text = el.textContent.trim();
          if (!text) continue;
          if (/\\d+岁/.test(text)) age = text;
          else if (/年|经验|应届/.test(text)) experience = text;
          else if (['博士', '硕士', '本科', '大专', '高中', '中专', '中技', '初中'].some(d => text.includes(d))) degree = text;
        }
      }

      const workTimes = [], eduTimes = [], workDetails = [], eduDetails = [];
      const timeList = container.querySelector?.('.experience-content.time-list');
      if (timeList) {
        for (const li of timeList.querySelectorAll('li')) {
          const href = li.querySelector('use')?.getAttribute('href') ||
            li.querySelector('use')?.getAttribute('xlink:href') || '';
          const value = li.querySelector('.time')?.textContent?.trim() || li.textContent.trim();
          if (href.includes('base-info-edu')) eduTimes.push(value); else workTimes.push(value);
        }
      }

      const detailList = container.querySelector?.('.experience-content.detail-list');
      if (detailList) {
        for (const li of detailList.querySelectorAll('li')) {
          const href = li.querySelector('use')?.getAttribute('href') ||
            li.querySelector('use')?.getAttribute('xlink:href') || '';
          const value = li.querySelector('.value')?.textContent?.trim() || li.textContent.trim();
          if (href.includes('base-info-edu')) eduDetails.push(value); else workDetails.push(value);
        }
      }

      const merge = (times, details) => {
        const rows = [];
        for (let i = 0; i < Math.max(times.length, details.length); i += 1) {
          rows.push([times[i], details[i]].filter(Boolean).join('  '));
        }
        return rows.filter(Boolean);
      };

      const workHistory = merge(workTimes, workDetails);
      const education = merge(eduTimes, eduDetails);
      const firstWork = workDetails[0] || '';
      const firstWorkParts = firstWork.split(/[·|｜]/).map(item => item.trim()).filter(Boolean);
      const currentCompany = firstWorkParts[0] || '';
      const currentPosition = firstWorkParts.slice(1).join('·') || '';
      const position = container.querySelector?.('.position-content');
      const expect = position?.querySelector('.position-item.expect .value')?.textContent?.trim() || '';
      return {
        name,
        gender,
        age,
        experience,
        degree,
        active_time: container.querySelector?.('.active-time')?.textContent?.trim() || '',
        current_company: currentCompany,
        current_position: currentPosition,
        work_history: workHistory.join('\\n') || '(未获取到)',
        education: education.join('\\n') || '(未获取到)',
        project_history: '',
        skills: '',
        job_chatting: position?.querySelector('.position-name')?.textContent?.trim() || friend?.jobName || '',
        expect,
        expect_city: '',
        expect_salary: ''
      };
    }

    async function typeAndSendMessage(text) {
      const editors = [
        '.conversation-editor [contenteditable="true"]',
        '.chat-input [contenteditable="true"]',
        '[contenteditable="true"]',
        'textarea'
      ];
      let editor = null;
      for (const selector of editors) {
        editor = document.querySelector(selector);
        if (editor) break;
      }
      if (!editor) return false;
      editor.focus();
      if (editor.isContentEditable) {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
      } else {
        editor.value = text;
      }
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      await wait(300);
      const sendButton = document.querySelector('.conversation-editor .submit') ||
        document.querySelector('.submit') ||
        [...document.querySelectorAll('button')].find(b => /发送/.test(b.textContent || ''));
      if (!sendButton) return false;
      sendButton.click();
      return true;
    }
`;
