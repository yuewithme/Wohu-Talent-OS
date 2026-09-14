const messages: Record<string, string> = {
  AUTH_REQUIRED: '请在连接设置中登录招聘系统。', FORBIDDEN: '当前账号没有执行此操作的权限。',
  BACKEND_NOT_CONFIGURED: '请先连接招聘系统，再进行查重和导入。', HOST_PERMISSION_REQUIRED: '招聘系统的访问授权已失效，请在设置中重新连接。',
  INVALID_API_ORIGIN: '请输入 HTTPS 服务根地址；本机开发可使用 http://localhost 或 http://127.0.0.1。',
  UNSUPPORTED_PAGE: '请在 BOSS 招聘端打开一份候选人详情或电子简历。',
  ADAPTER_DISABLED: '候选人读取已暂停，请检查插件设置或联系管理员。',
  ADAPTER_NOT_CONFIGURED: '当前 BOSS 页面尚未完成适配，请联系管理员提供页面样本。',
  UPSTREAM_PAGE_CHANGED: '页面结构与已验证版本不一致，已停止读取，请重新打开简历。',
  EXTRACTION_FAILED: '未能读取候选人，请等待简历加载完成后重试。', CANDIDATE_INCOMPLETE: '未读取到有效姓名，无法继续。',
  PAGE_CHANGED: '当前候选人已切换，请重新读取后继续。', PAGE_NOT_READY: '候选人仍在加载，请稍后重新读取。',
  PAGE_NOT_VISIBLE: 'BOSS 页面处于后台，详情绘制可能暂停。请恢复浏览器窗口并保持候选人页面可见，再重新读取。',
  AMBIGUOUS_CANDIDATE: '页面同时显示多份候选人详情，请只保留一份后重试。',
  JOB_NOT_FOUND: '岗位已不存在，请重新选择。', JOB_CLOSED: '岗位已关闭，请选择其他开放岗位。',
  DUPLICATE_REVIEW_REQUIRED: '请明确选择重复处理方式后再提交。', IDENTITY_CONFLICT: '身份匹配存在冲突，请联系管理员处理。',
  IMPORT_SESSION_EXPIRED: '预览已过期，请重新检查重复。', IMPORT_ALREADY_COMMITTED: '该预览已提交，请查询导入状态。',
  IDEMPOTENCY_KEY_CONFLICT: '提交内容与已有请求冲突，请查询导入状态并联系管理员。',
  IMPORT_PENDING: '有一笔提交结果尚未确认，请先查询状态或重试原提交。',
  RATE_LIMITED: '操作过于频繁，请稍后重试。', NETWORK_ERROR: '连接失败，请检查网络或招聘系统地址。',
  REQUEST_TIMEOUT: '请求超时。提交请求可使用原请求重试，请勿重新导入。',
  INVALID_SCHEMA: '数据格式不符合接口约定，请联系管理员检查插件与服务版本。',
  PAYLOAD_TOO_LARGE: '候选人信息超过大小限制，请联系管理员。', CLIENT_VERSION_UNSUPPORTED: '当前插件版本已停用，请更新插件。',
  INTERNAL_ERROR: '操作未完成，请重试或提供请求编号给管理员。', ORG_MISMATCH: '组织与登录账号不匹配，请检查连接设置。',
  CONTEXT_MISMATCH: '这笔提交属于另一个账号或组织，请使用原账号查询。',
};
export class AppError extends Error {
  constructor(public code: string, public request_id?: string) { super(messages[code] ?? messages.INTERNAL_ERROR); this.name = 'AppError'; }
}
export function safeError(error: unknown) {
  const e = error instanceof AppError ? error : new AppError('INTERNAL_ERROR');
  return { code: e.code, message: e.message, ...(e.request_id ? { request_id: e.request_id } : {}) };
}
