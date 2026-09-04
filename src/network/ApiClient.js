const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');

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
