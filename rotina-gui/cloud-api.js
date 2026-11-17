/* Meu Dia - cliente minimo Supabase Auth + PostgREST, sem dependencia de CDN.
   Chave publica somente. Senhas nunca ficam armazenadas. */
(() => {
  'use strict';
  if (window.supabase?.createClient) return;

  const STORAGE = 'meu-dia-auth-v1';
  const clean = value => String(value || '').replace(/\/$/, '');
  const errorValue = (value, status) => ({
    message: value?.msg || value?.message || value?.error_description || value?.error || ('Erro HTTP ' + status),
    code: value?.code || value?.error_code || 'http_' + status,
    status
  });

  function createClient(projectURL, publicKey) {
    const base = clean(projectURL);
    let session = null;
    const listeners = new Set();
    let refreshing = null;
    let initialEvent = null;

    const dispatch = event => {
      for (const cb of listeners) try { cb(event, session); } catch (e) { console.error('Erro no listener de autenticação', e); }
    };
    const persist = value => {
      session = value || null;
      try {
        if (session) localStorage.setItem(STORAGE, JSON.stringify(session));
        else localStorage.removeItem(STORAGE);
      } catch (e) { console.warn('Não foi possível salvar a sessão', e); }
    };
    try {
      const old = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (old && old.access_token && old.refresh_token) session = old;
    } catch (e) { console.warn('Sessão local inválida', e); }

    // Os links do Supabase devolvem tokens no fragmento da URL.
    // Consumir apenas quando ambos estiverem presentes; remover da barra depois.
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (hash.get('access_token') && hash.get('refresh_token')) {
      persist({
        access_token: hash.get('access_token'),
        refresh_token: hash.get('refresh_token'),
        expires_at: Math.floor(Date.now() / 1000) + Number(hash.get('expires_in') || 3600),
        token_type: hash.get('token_type') || 'bearer'
      });
      initialEvent = hash.get('type') === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN';
      try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    }

    async function request(path, method = 'GET', body, token, extra = {}) {
      const headers = {
        apikey: publicKey,
        'Content-Type': 'application/json',
        ...extra
      };
      if (token) headers.Authorization = 'Bearer ' + token;
      try {
        const options = { method, headers };
        if (body !== undefined) options.body = JSON.stringify(body);
        const response = await fetch(base + path, options);
        const raw = await response.text();
        let data = null;
        if (raw) {
          try { data = JSON.parse(raw); }
          catch { data = { message: raw.slice(0, 300) }; }
        }
        return response.ok
          ? { data, error: null, status: response.status }
          : { data: null, error: errorValue(data, response.status), status: response.status };
      } catch (e) {
        return { data: null, error: { message: e.message || 'Falha de conexão', code: 'network_error' }, status: 0 };
      }
    }
    function saveTokens(data) {
      if (!data?.access_token || !data?.refresh_token) return false;
      const expiry = data.expires_at || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600);
      persist({ ...data, expires_at: expiry });
      return true;
    }

    async function refreshToken() {
      if (refreshing) return refreshing;
      if (!session?.refresh_token) return false;
      refreshing = (async () => {
        const res = await request('/auth/v1/token?grant_type=refresh_token', 'POST', {
          refresh_token: session.refresh_token
        });
        if (res.error || !saveTokens(res.data)) {
          if (res.status === 400 || res.status === 401) {
            persist(null);
            dispatch('SIGNED_OUT');
          }
          return false;
        }
        dispatch('TOKEN_REFRESHED');
        return true;
      })();
      try { return await refreshing; }
      finally { refreshing = null; }
    }
    async function accessToken() {
      if (!session?.access_token) return null;
      if (session.expires_at && session.expires_at <= Date.now() / 1000 + 45) {
        if (!await refreshToken()) return null;
      }
      return session?.access_token || null;
    }
    async function authenticated(path, method='GET', body, extra={}) {
      let token = await accessToken();
      if (!token) return { data: null, error: { message: 'Sessão não disponível; entre novamente.', code: 'no_session' } };
      let res = await request(path, method, body, token, extra);
      if (res.status === 401 && await refreshToken()) {
        token = await accessToken();
        if (token) res = await request(path, method, body, token, extra);
      }
      return res;
    }
    function urlForRedirect(path, redirect) {
      if (!redirect) return path;
      const separator = path.includes('?') ? '&' : '?';
      return path + separator + 'redirect_to=' + encodeURIComponent(redirect);
    }

    const auth = {
      onAuthStateChange(callback) {
        listeners.add(callback);
        if (initialEvent) {
          const event = initialEvent;
          initialEvent = null;
          Promise.resolve().then(() => { if (listeners.has(callback)) callback(event, session); });
        }
        return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } };
      },
      async getUser() {
        if (!session) return { data: { user: null }, error: { message: 'Sem sessão', code: 'no_session' } };
        const res = await authenticated('/auth/v1/user');
        const user = res.data?.id ? res.data : null;
        if (user && session) {
          session.user = user;
          persist(session);
        }
        return { data: { user }, error: res.error };
      },
      async signInWithPassword({ email, password }) {
        const res = await request('/auth/v1/token?grant_type=password', 'POST', { email, password });
        if (!res.error && saveTokens(res.data)) {
          dispatch('SIGNED_IN');
          return { data: { user: res.data.user, session }, error: null };
        }
        return { data: { user: null, session: null }, error: res.error || { message: 'Não foi possível entrar.' } };
      },
      async signUp({ email, password, options = {} }) {
        const path = urlForRedirect('/auth/v1/signup', options.emailRedirectTo);
        const res = await request(path, 'POST', { email, password });
        if (!res.error && saveTokens(res.data)) dispatch('SIGNED_IN');
        return { data: { user: res.data?.user || (res.data?.id ? res.data : null), session: res.data?.access_token ? session : null }, error: res.error };
      },
      async signInWithOtp({ email, options = {} }) {
        const path = urlForRedirect('/auth/v1/otp', options.emailRedirectTo);
        const res = await request(path, 'POST', { email, create_user: options.shouldCreateUser !== false });
        return { data: res.data, error: res.error };
      },
      async resetPasswordForEmail(email, options = {}) {
        const path = urlForRedirect('/auth/v1/recover', options.redirectTo);
        const res = await request(path, 'POST', { email });
        return { data: res.data, error: res.error };
      },
      async resend({ type, email, options = {} }) {
        const path = urlForRedirect('/auth/v1/resend', options.emailRedirectTo);
        const res = await request(path, 'POST', { type, email });
        return { data: res.data, error: res.error };
      },
      async updateUser(attributes) {
        const res = await authenticated('/auth/v1/user', 'PUT', attributes);
        return { data: { user: res.data }, error: res.error };
      },
      async signOut() {
        const token = session?.access_token;
        if (token) await request('/auth/v1/logout', 'POST', undefined, token);
        persist(null);
        dispatch('SIGNED_OUT');
        return { error: null };
      }
    };

    class Query {
      constructor(table, method='GET', body=undefined) {
        this.table = table;
        this.method = method;
        this.body = body;
        this.conditions = [];
        this.selection = '*';
      }
      select(columns) {
        this.selection = columns;
        return this;
      }
      eq(column, value) {
        this.conditions.push([column, value]);
        return this;
      }
      maybeSingle() { return this.run(true, false); }
      single() { return this.run(true, true); }
      async run(asObject, required) {
        const qp = new URLSearchParams();
        qp.set('select', this.selection);
        for (const [column, value] of this.conditions) qp.append(column, 'eq.' + value);
        const path = '/rest/v1/' + encodeURIComponent(this.table) + '?' + qp.toString();
        const extra = this.method === 'GET'
          ? {}
          : { Prefer: 'return=representation' };
        const res = await authenticated(path, this.method, this.body, extra);
        if (res.error) return { data: null, error: res.error };
        const items = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
        if (asObject) {
          if (!items.length && required) return { data: null, error: { message: 'Registro não encontrado', code: 'not_found' } };
          return { data: items[0] || null, error: null };
        }
        return { data: items, error: null };
      }
    }
    return {
      auth,
      from(table) {
        return {
          select(columns) { return new Query(table).select(columns); },
          insert(payload) { return new Query(table, 'POST', payload); },
          update(payload) { return new Query(table, 'PATCH', payload); }
        };
      }
    };
  }
  window.supabase = { createClient };
})();
