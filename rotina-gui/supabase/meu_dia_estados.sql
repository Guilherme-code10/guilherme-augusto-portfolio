-- Dados exclusivos do Meu Dia. Não altera nenhuma tabela financeira.
create table if not exists public.meu_dia_estados (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint meu_dia_payload_valido check (
    jsonb_typeof(payload) = 'object' and
    payload->>'schema' = '2' and
    octet_length(payload::text) <= 1048576
  )
);

alter table public.meu_dia_estados enable row level security;
revoke all on public.meu_dia_estados from public, anon, authenticated;

create policy meu_dia_ler_proprio on public.meu_dia_estados
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy meu_dia_criar_proprio on public.meu_dia_estados
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy meu_dia_atualizar_proprio on public.meu_dia_estados
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.meu_dia_estados to authenticated;
grant all on public.meu_dia_estados to service_role;
comment on table public.meu_dia_estados is 'Dados por conta do app Meu Dia. Isolado dos sistemas financeiros.';
