# Meu Dia — sincronização entre aparelhos

O aplicativo atual continua usando `gui-planner-v2` no `localStorage`, sem depender de servidor.

## Preparação concluída

- `meu_dia_estados.sql`: tabela exclusiva com RLS (permissões por usuário).
- `cloud-sync.js`: login, cadastro, verificação de sessão, salvamento, restauração e conciliação de revisões.
- `app.js`: API `window.MeuDiaCloudApp` e notificação de mudanças, sem alterar o funcionamento offline.

## Para ativar depois que o projeto exclusivo for criado

1. Executar `supabase/meu_dia_estados.sql` no projeto exclusivo (não no financeiro).
2. Obter URL e somente a chave **publicável** do projeto.
3. Autorizar o redirect `https://guilherme-code10.github.io/guilherme-augusto-portfolio/rotina-gui/` nas configurações de Auth do projeto.
4. Incluir `<script defer src="./cloud-config.js"></script>`, a UMD fixada `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js` e `<script defer src="./cloud-sync.js"></script>`, após `app.js`.
5. Adicionar ao HTML do painel de configurações os IDs: `cloudPanel`, `cloudStatus`, `cloudLogin`, `cloudLoginEmail`, `cloudLoginPassword`, `cloudSignedIn`, `cloudEmail`, `cloudSignUp`, `cloudSignOut` e `cloudRetry`.
6. Testar conta nova, confirmação por e-mail, sessão existente, concorrência PC/celular, uso offline e reconexão.

**Importante:** Não publicar no app a chave do Supabase do financeiro. Há tabelas financeiras sem RLS no projeto existente. O Meu Dia necessita projeto exclusivo.

## Implantação realizada em 16/11/2026

- Projeto Supabase exclusivo: `meu-dia-gui` (ref `lizuzulqfmstdokuvmwj`).
- Tabela `public.meu_dia_estados` criada via migração com RLS e políticas por `auth.uid()`.
- `cloud-config.js` usa SOMENTE a chave publicável do projeto exclusivo.
- Biblioteca `@supabase/supabase-js` fixada na versão 2.119.0.
- O login e os dados iniciais da conta devem ser validados em aparelhos reais após cadastro.
- Confira em Authentication → URL Configuration: Site URL e Redirect URLs para `https://guilherme-code10.github.io/guilherme-augusto-portfolio/rotina-gui/` caso o link de confirmação de e-mail redirecione para um endereço inválido.
