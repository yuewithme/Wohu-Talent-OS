export const PAGE_ROUTER_SCRIPT = String.raw`
    async function main() {
      if (command === 'status') {
        return [{ url: location.href, title: document.title, time_origin: performance.timeOrigin }];
      }
      if (command === 'chatlist') return runChatlist();
      if (command === 'recommend') return runRecommend();
      if (command === 'joblist') return runJoblist();
      if (command === 'stats') return runStats();
      if (command === 'chatmsg') return runChatmsg();
      if (command === 'resume') return runResume();
      if (command === 'label-list') return runLabels();
      if (command === 'send') return runSendLike(params.text || params._?.[1] || '');
      if (command === 'greet') return runSendLike(params.text || '你好，请问您对这个职位感兴趣吗？');
      if (command === 'batchgreet') return runBatchgreet();
      if (command === 'mark') return runMark();
      if (command === 'exchange') return runExchange();
      if (command === 'invite') return runInvite();
      throw new Error('Unsupported command: ' + command);
    }

    return main();
`;
