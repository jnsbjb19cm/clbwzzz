// 2026-09-11 跨机：开发模式下用「当前主机名」而不是写死 localhost，
// 这样别人用 http://<你的局域网IP>:5173 访问时，API 会自动指向 http://<同一IP>:3001/api。
// 2026-10-10：`import.meta.env` 是 **Vite 专有**的，Node 里是 undefined。
// 服务端为了 PVP 权威模拟会 import 到 src/ 下的战斗模块，万一链路把这里拖进 Node，
// 原来会直接 `Cannot read properties of undefined (reading 'VITE_API_BASE_URL')` 把服务端整个崩掉。
// 现在用可选链兜底：非浏览器环境拿到的只是一个用不到的默认地址，绝不会崩。
const VITE_ENV = import.meta.env ?? {};
const DEV_HOST = (() => {
  try { return globalThis.location?.hostname || 'localhost'; } catch { return 'localhost'; }
})();
const DEFAULT_BASE_URL = VITE_ENV.VITE_API_BASE_URL
  || (VITE_ENV.DEV ? `http://${DEV_HOST}:3001/api` : '/api');

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class ApiClient {
  constructor({ baseUrl = DEFAULT_BASE_URL, getToken = () => '' } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.getToken = getToken;
  }

  async request(path, options = {}) {
    const token = this.getToken();
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body != null) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    } catch (error) {
      throw new ApiError('无法连接服务器，请确认后端已经启动', 0, error);
    }

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      throw new ApiError(data?.message || `请求失败(${response.status})`, response.status, data);
    }
    return data;
  }

  get(path) { return this.request(path); }
  post(path, body) { return this.request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }); }
  put(path, body) { return this.request(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }); }
  delete(path, body) { return this.request(path, { method: 'DELETE', body: body == null ? undefined : JSON.stringify(body) }); }
}
