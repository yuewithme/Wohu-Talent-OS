const DEFAULT_COMMAND_URL = process.env.KIMI_WEBBRIDGE_COMMAND_URL || 'http://127.0.0.1:10086/command';

export class KimiClient {
  constructor({ commandUrl = DEFAULT_COMMAND_URL, session = 'boss-kimi-adapter' } = {}) {
    this.commandUrl = commandUrl;
    this.session = session;
  }

  async command(action, args = {}) {
    const response = await fetch(this.commandUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args, session: this.session }),
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Kimi WebBridge returned non-JSON response: ${text.slice(0, 200)}`);
    }

    if (!response.ok || payload.ok === false) {
      const message = payload.error || payload.message || text;
      throw new Error(`Kimi WebBridge ${action} failed: ${message}`);
    }

    return payload.data ?? payload;
  }

  async findBossTab({ active = false } = {}) {
    const data = await this.command('find_tab', {
      url: 'https://www.zhipin.com',
      active,
    });

    if (!data.success || !data.url || !/zhipin\.com/i.test(data.url)) {
      throw new Error('No existing BOSS zhipin.com tab is available. Open and log in to BOSS first.');
    }

    return data;
  }

  async evaluate(code) {
    const data = await this.command('evaluate', { code });
    if (data && Object.prototype.hasOwnProperty.call(data, 'value')) {
      return data.value;
    }
    return data;
  }
}
