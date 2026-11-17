/* Meu Dia: sincronização opcional, autenticada e isolada.
   Usa apenas chave publicável; nunca coloque service_role neste arquivo. */
(() => {
  'use strict';
  const config = window.MEU_DIA_CLOUD_CONFIG;
  const app = window.MeuDiaCloudApp;
  const root = document.getElementById('cloudPanel');
  if (!root || !app) return;

  const statusEl = document.getElementById('cloudStatus');
  const loginForm = document.getElementById('cloudLogin');
  const signedIn = document.getElementById('cloudSignedIn');
  const emailDisplay = document.getElementById('cloudEmail');
  const signUpButton = document.getElementById('cloudSignUp');
  const magicLinkButton = document.getElementById('cloudMagicLink');
  const forgotButton = document.getElementById('cloudForgot');
  const togglePasswordButton = document.getElementById('cloudTogglePassword');
  const recoverySection = document.getElementById('cloudRecovery');
  const recoveryForm = document.getElementById('cloudRecoveryForm');
  const newPassword = document.getElementById('cloudNewPassword');
  const signOutButton = document.getElementById('cloudSignOut');
  const retryButton = document.getElementById('cloudRetry');
  const showChangePassword = document.getElementById('cloudShowPasswordChange');
  const changePasswordPanel = document.getElementById('cloudPasswordChange');
  const changePasswordForm = document.getElementById('cloudPasswordForm');
  const accountNewPassword = document.getElementById('cloudAccountNewPassword');
  const accountConfirmPassword = document.getElementById('cloudAccountConfirmPassword');
  const cancelChangePassword = document.getElementById('cloudCancelPasswordChange');
  const SYNC_KEY = 'meu-dia-nuvem-v1';
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const readMeta = () => {
    try { return JSON.parse(localStorage.getItem(SYNC_KEY) || 'null') || {}; }
    catch { return {}; }
  };
  const saveMeta = value => {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(value)); }
    catch { /* app continua com armazenamento local */ }
  };

  /* Merge de três vias: preserva mudanças locais em campos distintos
     e também mudanças que chegaram de outro aparelho. Em conflito no
     mesmo campo, prevalece a edição local ainda não sincronizada. */
  function merge(base, local, remote) {
    if (equal(local, base)) return remote;
    if (equal(remote, base)) return local;
    if (equal(local, remote)) return local;
    if (object(local) && object(remote)) {
      const out = {};
      const keys = new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)]);
      for (const key of keys) {
        const value = merge(base?.[key], local[key], remote[key]);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    if (Array.isArray(local) && Array.isArray(remote)) {
      if (local.every(item => object(item) && typeof item.id === 'string')
          && remote.every(item => object(item) && typeof item.id === 'string')) {
        const byId = list => new Map(list.map(item => [item.id, item]));
        const old = byId(Array.isArray(base) ? base : []);
        const mine = byId(local), theirs = byId(remote);
        const ids = new Set([...old.keys(), ...mine.keys(), ...theirs.keys()]);
        return [...ids].map(id => merge(old.get(id), mine.get(id), theirs.get(id)))
          .filter(item => item !== undefined);
      }
      if (local.length === remote.length && local.length === (base?.length || 0))
        return local.map((item, index) => merge(base[index], item, remote[index]));
    }
    return local;
  }

  if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) {
    const problem = 'A conexão online não carregou. Atualize esta página. Suas tarefas permanecem salvas neste aparelho.';
    statusEl.textContent = problem;
    const indicator = document.getElementById('cloudIndicator');
    if (indicator) indicator.textContent = problem;
    loginForm.hidden = true;
    return;
  }
  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  let user = null, revision = null, baseline = null, pending = false;
  let changed = 0, syncTimer = null, activeRequest = false, loading = false, failureCount = 0;
  let bootSequence = 0, lastOnlineCheck = 0;

  function message(value) { statusEl.textContent = value; const badge = document.getElementById('cloudIndicator'); if (badge) badge.textContent = value; const button=document.getElementById('cloudConnectButton'); if (button) button.textContent = user ? 'Minha conta e sincronização' : 'Conectar celular e PC'; }
  function schedule(delay = 1000) {
    clearTimeout(syncTimer);
    if (user) syncTimer = setTimeout(() => void upload(), delay);
  }
  function remember() {
    if (!user || revision === null || !baseline) return;
    saveMeta({ userId: user.id, revision, baseline, savedAt: Date.now() });
  }
  function preserveLocal() {
    try {
      const key = 'meu-dia-backup-antes-da-nuvem-' + new Date().toISOString().slice(0, 10);
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(app.read()));
    } catch { /* os dados principais permanecem no armazenamento original */ }
  }
  async function remoteRow() {
    const { data, error } = await client.from('meu_dia_estados')
      .select('revision,payload,updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function begin(account) {
    const seq = ++bootSequence;
    loading = true;
    clearTimeout(syncTimer);
    user = account;
    revision = null;
    baseline = null;
    loginForm.hidden = true;
    signedIn.hidden = false;
    emailDisplay.textContent = account.email || 'Conta conectada';
    message('Conectando os aparelhos...');
    try {
      const remote = await remoteRow();
      if (seq !== bootSequence) return;
      const meta = readMeta();
      const local = app.read();
      const sameAccount = !meta.userId || meta.userId === account.id;
      const oldBase = sameAccount && meta.baseline ? meta.baseline : app.seed();
      if (!remote) {
        if (!sameAccount) {
          preserveLocal();
          app.replace(app.seed());
        }
        const payload = app.read();
        const { data, error } = await client.from('meu_dia_estados')
          .insert({ user_id: account.id, payload, revision: 1 })
          .select('revision,payload').single();
        if (error) {
          if (error.code !== '23505') throw error;
          await begin(account);
          return;
        }
        revision = data.revision;
        baseline = copy(data.payload);
      } else {
        revision = Number(remote.revision);
        baseline = copy(remote.payload);
        failureCount = 0;
        const combined = sameAccount ? merge(oldBase, local, remote.payload) : remote.payload;
        if (!equal(local, combined)) preserveLocal();
        app.replace(combined);
        if (!equal(combined, remote.payload)) {
          pending = true;
          changed++;
        }
      }
      remember();
      message(pending ? 'Salvo neste aparelho; enviando alterações...' : 'Sincronizado ✓ · celular e computador');
    } catch (error) {
      message('Sem conexão com a nuvem. Seus dados continuam neste aparelho. ' + (error.message || ''));
      pending = true;
    } finally {
      if (seq === bootSequence) {
        loading = false;
        if (pending) schedule(150);
      }
    }
  }

  async function upload() {
    if (!user || loading || activeRequest || !navigator.onLine) return;
    if (!pending) return;
    if (revision === null || !baseline) return void refresh();
    activeRequest = true;
    const generation = changed;
    const snapshot = copy(app.read());
    try {
      const { data, error } = await client.from('meu_dia_estados')
        .update({ payload: snapshot, revision: revision + 1, updated_at: new Date().toISOString() })
        .eq('user_id', user.id).eq('revision', revision)
        .select('revision,payload').maybeSingle();
      if (error) throw error;
      if (!data) {
        const latest = await remoteRow();
        if (!latest) throw new Error('Estado remoto não encontrado');
        const combined = merge(baseline, app.read(), latest.payload);
        revision = Number(latest.revision);
        baseline = copy(latest.payload);
        app.replace(combined);
        pending = true;
        changed++;
        remember();
        message('Conciliando edições feitas em outro aparelho...');
      } else {
        revision = Number(data.revision);
        failureCount = 0;
        baseline = snapshot;
        pending = changed !== generation;
        remember();
        message(pending ? 'Enviando últimas alterações...' : 'Sincronizado ✓ · celular e computador');
      }
    } catch (error) {
      pending = true;
      failureCount++;
      message('Alterações salvas no aparelho. Tentaremos novamente na nuvem. ' + (error.message || ''));
    } finally {
      activeRequest = false;
      if (pending) schedule(failureCount ? Math.min(60000, 3000 * Math.pow(2, Math.min(failureCount, 5))) : 600);
    }
  }

  async function refresh() {
    if (!user || loading || activeRequest || !navigator.onLine) return;
    activeRequest = true;
    try {
      const remote = await remoteRow();
      if (!remote) { activeRequest = false; void begin(user); return; }
      if (revision !== Number(remote.revision)) {
        const combined = pending ? merge(baseline || app.seed(), app.read(), remote.payload) : remote.payload;
        revision = Number(remote.revision);
        baseline = copy(remote.payload);
        app.replace(combined);
        if (pending && !equal(combined, remote.payload)) changed++;
        else pending = false;
        remember();
      }
      if (!pending) message('Sincronizado ✓ · celular e computador');
    } catch (error) {
      message('Modo local · conexão indisponível. As alterações serão reenviadas.');
    } finally {
      activeRequest = false;
      if (pending) schedule(1000);
    }
  }

  window.MeuDiaCloud = {
    localChanged() {
      if (!user || loading) return;
      changed++;
      pending = true;
      message('Salvo neste aparelho; sincronizando...');
      schedule();
    },
  };
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('cloudLoginEmail').value.trim();
    const password = document.getElementById('cloudLoginPassword').value;
    message('Entrando com segurança...');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      const code = error.code || '';
      if (code === 'invalid_credentials' || error.message === 'Invalid login credentials')
        message('Senha não reconhecida. Se você já entrou no PC, pode alterar a senha lá em "Minha conta e sincronização" → "Alterar minha senha", sem pedir outro e-mail.');
      else if (code === 'email_not_confirmed' || error.message === 'Email not confirmed')
        message('Esta conta precisa validar o e-mail antes do primeiro acesso. Confira o e-mail de cadastro.');
      else message('Não foi possível entrar: ' + error.message);
    }
    document.getElementById('cloudLoginPassword').value = '';
  });
  signUpButton.addEventListener('click', async () => {
    const email = document.getElementById('cloudLoginEmail').value.trim();
    const password = document.getElementById('cloudLoginPassword').value;
    if (!email || password.length < 8) {
      message('Informe e-mail e senha com pelo menos 8 caracteres.');
      return;
    }
    message('Criando conta...');
    const { data, error } = await client.auth.signUp({ email, password, options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    }});
    if (error) message('Não foi possível cadastrar: ' + error.message);
    else if (!data.session) message('Cadastro solicitado. Verifique a caixa de entrada e spam para confirmar o e-mail. Depois, volte aqui e entre.');
    else message('Conta criada. Conectando...');
    document.getElementById('cloudLoginPassword').value = '';
  });
  togglePasswordButton.addEventListener('click', () => {
    const input = document.getElementById('cloudLoginPassword');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    togglePasswordButton.textContent = show ? 'Ocultar senha' : 'Mostrar senha';
    togglePasswordButton.setAttribute('aria-pressed', String(show));
  });

  forgotButton.addEventListener('click', async () => {
    const email = document.getElementById('cloudLoginEmail').value.trim();
    if (!email) { message('Informe seu e-mail para recuperar o acesso.'); return; }
    forgotButton.disabled = true;
    message('Solicitando o link para definir uma nova senha...');
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      message(error
        ? 'Não foi possível solicitar a recuperação: ' + error.message
        : 'Se esse e-mail estiver cadastrado, você receberá um link para trocar a senha. Confira o Gmail e o Spam.');
    } catch {
      message('Sem conexão para solicitar a recuperação. Tente novamente.');
    } finally { forgotButton.disabled = false; }
  });

  recoveryForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (newPassword.value.length < 8) {
      message('Sua nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    message('Atualizando sua senha...');
    const { error } = await client.auth.updateUser({ password: newPassword.value });
    newPassword.value = '';
    if (error) message('Não foi possível atualizar a senha: ' + error.message);
    else {
      recoverySection.hidden = true;
      message('Senha atualizada. Conta conectada; suas tarefas serão sincronizadas automaticamente.');
      if (user) void (pending ? upload() : refresh());
    }
  });

  magicLinkButton.addEventListener('click', async () => {
    const email = document.getElementById('cloudLoginEmail').value.trim();
    if (!email || !document.getElementById('cloudLoginEmail').checkValidity()) {
      message('Informe um e-mail válido para receber seu link de acesso.');
      document.getElementById('cloudLoginEmail').focus();
      return;
    }
    magicLinkButton.disabled = true;
    message('Solicitando seu link de acesso...');
    try {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (error) {
        if (error.code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(error.message || '')) {
          message('O Supabase atingiu o limite de envio de e-mails. Não tente outro link agora. Use sua senha ou altere a senha no computador onde você já está conectado.');
        } else message('Não foi possível enviar o link: ' + error.message);
      } else message('Link solicitado! Abra o e-mail de acesso no seu celular ou PC. Não é preciso confirmar seu cadastro novamente.');
    } catch (error) {
      message('Não foi possível solicitar o link: ' + (error?.message || 'Verifique sua conexão.'));
    } finally {
      magicLinkButton.disabled = false;
    }
  });
  function toggleChangePassword(open) {
    changePasswordPanel.hidden = !open;
    showChangePassword.setAttribute('aria-expanded', String(open));
    if (open) accountNewPassword.focus();
    else { accountNewPassword.value = ''; accountConfirmPassword.value = ''; }
  }
  showChangePassword.addEventListener('click', () => toggleChangePassword(changePasswordPanel.hidden));
  cancelChangePassword.addEventListener('click', () => toggleChangePassword(false));
  changePasswordForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!user) { message('Entre na conta antes de alterar a senha.'); return; }
    const password = accountNewPassword.value;
    if (password.length < 8) {
      message('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (accountConfirmPassword.value !== password) {
      message('As duas senhas não são iguais. Confira e tente novamente.');
      return;
    }
    const submit = changePasswordForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    message('Atualizando sua senha de acesso...');
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        message('Não foi possível mudar a senha: ' + error.message);
        return;
      }
      toggleChangePassword(false);
      message('Senha atualizada! Agora entre com a mesma conta e a senha nova no celular. Não precisa confirmar e-mail.');
    } catch (e) {
      message('Não foi possível mudar a senha: ' + (e?.message || 'falha de conexão'));
    } finally {
      accountNewPassword.value = '';
      accountConfirmPassword.value = '';
      submit.disabled = false;
    }
  });
  signOutButton.addEventListener('click', () => void client.auth.signOut());
  retryButton.addEventListener('click', () => void (pending ? upload() : refresh()));
  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => {
      if (_event === 'PASSWORD_RECOVERY') {
        recoverySection.hidden = false;
        document.querySelector('nav button[data-view="settings"]')?.click();
        recoverySection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        message('Defina uma nova senha para finalizar a recuperação de acesso.');
      }
      if (session?.user) {
        if (user?.id !== session.user.id) void begin(session.user);
      } else {
        ++bootSequence;
        user = null;
        revision = null;
        baseline = null;
        clearTimeout(syncTimer);
        loginForm.hidden = false;
        signedIn.hidden = true;
        message('Nuvem desconectada · acesse a mesma conta nos dois aparelhos. As tarefas deste aparelho estão preservadas.');
      }
    }, 0);
  });
  client.auth.getUser().then(({ data, error }) => {
    if (error || !data.user) {
      message('Nuvem desconectada · use sua conta existente ou entre sem senha pelo link de acesso.');
      loginForm.hidden = false;
    } else if (!user) void begin(data.user);
  }).catch(() => {
    message('Sem conexão com o serviço de login. O modo local continua funcionando.');
  });
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !navigator.onLine || !user) return;
    if (Date.now() - lastOnlineCheck < 10000) return;
    lastOnlineCheck = Date.now();
    void (pending ? upload() : refresh());
  }, 12000);
  window.addEventListener('online', () => void (pending ? upload() : refresh()));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void (pending ? upload() : refresh());
  });
})();
