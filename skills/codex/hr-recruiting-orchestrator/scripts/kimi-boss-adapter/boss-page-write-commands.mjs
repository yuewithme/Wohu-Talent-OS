export const PAGE_WRITE_COMMANDS_SCRIPT = String.raw`
    async function runSendLike(defaultText) {
      const uid = params.uid || params._?.[0];
      const text = params.text || params._?.[1] || defaultText;
      if (!uid) throw new Error(command + ' requires uid');
      const friend = await findFriendByUid(uid, { maxPages: 5, checkGreetList: true });
      if (!friend) throw new Error('未找到该候选人');
      const friendName = friend.name || '候选人';
      if (!params.confirm) {
        return [{ status: 'DRY_RUN', detail: '未执行发送。加 --confirm 后会向 ' + friendName + ' 发送: ' + text }];
      }
      if (!clickCandidateInList(friend.uid)) throw new Error('无法在聊天列表中找到该用户');
      await wait(1500);
      const sent = await typeAndSendMessage(text);
      if (!sent) throw new Error('找不到消息输入框或发送按钮');
      return [{ status: command === 'greet' ? '✅ 招呼已发送' : '✅ 发送成功', detail: '已向 ' + friendName + ' 发送: ' + text }];
    }

    async function runBatchgreet() {
      const limit = positive(params.limit, 5, 50);
      const text = params.text || '你好，请问您对这个职位感兴趣吗？';
      const filterJobId = params.jobId || params['job-id'] || '';
      let candidates = await fetchRecommendList();
      if (filterJobId) candidates = candidates.filter(f => f.encryptJobId === filterJobId);
      candidates = candidates.slice(0, limit);
      if (!params.confirm) {
        return candidates.map(f => ({
          name: f.name || '',
          uid: f.encryptUid || '',
          status: 'DRY_RUN',
          detail: '未执行批量招呼。加 --confirm 后发送: ' + text
        }));
      }
      const rows = [];
      for (const c of candidates) {
        try {
          if (!clickCandidateInList(c.uid)) {
            rows.push({ name: c.name || '', status: '❌ 跳过', detail: '在聊天列表中未找到' });
            continue;
          }
          await wait(1500);
          const sent = await typeAndSendMessage(text);
          rows.push({ name: c.name || '', status: sent ? '✅ 已发送' : '❌ 失败', detail: sent ? text : '找不到消息输入框' });
        } catch (error) {
          rows.push({ name: c.name || '', status: '❌ 失败', detail: String(error.message || error).slice(0, 120) });
        }
      }
      return rows;
    }

    async function runMark() {
      const uid = params.uid || params._?.[0];
      const labelInput = params.label || params._?.[1];
      if (!uid || !labelInput) throw new Error('mark requires uid and label');
      const labelId = resolveLabel(labelInput);
      const remove = params.remove === true;
      const friend = await findFriendByUid(uid, { checkGreetList: true });
      if (!friend) throw new Error('未找到该候选人');
      const action = remove ? 'deleteMark' : 'addMark';
      const qs = new URLSearchParams({
        friendId: String(friend.uid),
        friendSource: String(friend.friendSource ?? 0),
        labelId: String(labelId)
      });
      if (!params.confirm) {
        return [{ status: 'DRY_RUN', detail: (remove ? '移除' : '添加') + '标签「' + labelInput + '」到 ' + (friend.name || '候选人') }];
      }
      await bossFetch('https://' + BOSS_DOMAIN + '/wapi/zprelation/friend/label/' + action + '?' + qs.toString());
      return [{ status: remove ? '✅ 标签已移除' : '✅ 标签已添加', detail: (friend.name || '候选人') + ': ' + labelInput }];
    }

    async function runExchange() {
      const uid = params.uid || params._?.[0];
      const type = params.type || 'phone';
      if (!uid) throw new Error('exchange requires uid');
      const friend = await findFriendByUid(uid, { checkGreetList: true });
      if (!friend) throw new Error('未找到该候选人');
      const typeId = type === 'wechat' ? 2 : 1;
      const qs = new URLSearchParams({
        type: String(typeId),
        securityId: friend.securityId || '',
        uniqueId: String(friend.uid),
        name: friend.name || '候选人'
      });
      if (!params.confirm) {
        return [{ status: 'DRY_RUN', detail: '未执行交换联系方式。加 --confirm 后请求 ' + (type === 'wechat' ? '微信' : '手机号') }];
      }
      await bossFetch('https://' + BOSS_DOMAIN + '/wapi/zpchat/exchange/request', {
        method: 'POST',
        body: qs.toString()
      });
      return [{ status: '✅ 交换请求已发送', detail: '已向 ' + (friend.name || '候选人') + ' 请求' + (type === 'wechat' ? '微信' : '手机号') }];
    }

    async function runInvite() {
      const uid = params.uid || params._?.[0];
      const interviewTimeText = params.time;
      if (!uid || !interviewTimeText) throw new Error('invite requires uid and --time');
      const friend = await findFriendByUid(uid, { checkGreetList: true });
      if (!friend) throw new Error('未找到该候选人');
      const timeMs = new Date(interviewTimeText).getTime();
      if (Number.isNaN(timeMs)) throw new Error('时间格式错误: ' + interviewTimeText);
      const contactData = await bossFetch('https://' + BOSS_DOMAIN + '/wapi/zpinterview/boss/interview/contactInit', {
        allowNonZero: true,
        timeout: 10000
      });
      const addressData = await bossFetch('https://' + BOSS_DOMAIN + '/wapi/zpinterview/boss/interview/listAddress', {
        allowNonZero: true,
        timeout: 10000
      });
      const savedAddress = addressData.zpData?.list?.[0] || {};
      const contactName = params.contact || contactData.zpData?.contactName || '';
      const address = params.address || savedAddress.cityAddressText || savedAddress.addressText || '';
      const qs = new URLSearchParams({
        uid: String(friend.uid),
        securityId: friend.securityId || '',
        encryptJobId: friend.encryptJobId || '',
        interviewTime: String(timeMs),
        contactId: contactData.zpData?.contactId || '',
        contactName,
        contactPhone: contactData.zpData?.contactPhone || '',
        address,
        interviewType: '1'
      });
      if (!params.confirm) {
        return [{ status: 'DRY_RUN', detail: '未发送面试邀请。加 --confirm 后发送给 ' + (friend.name || '候选人') + '，时间: ' + interviewTimeText + '，地点: ' + address }];
      }
      await bossFetch('https://' + BOSS_DOMAIN + '/wapi/zpinterview/boss/interview/invite.json', {
        method: 'POST',
        body: qs.toString()
      });
      return [{ status: '✅ 面试邀请已发送', detail: '已向 ' + (friend.name || '候选人') + ' 发送面试邀请' }];
    }
`;
