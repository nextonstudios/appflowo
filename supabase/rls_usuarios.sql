-- ============================================================
-- Row Level Security — Todas las tablas de usuarios
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
--
-- Este archivo es idempotente: si RLS ya está habilitado o
-- la política ya existe, no genera errores.
-- ============================================================

-- ── Limpieza de políticas rotas (req_token ya no existe) ──
drop policy if exists "Portal valida su token" on public.portal_tokens;
drop policy if exists "Portal lee su cliente" on public.clientes;
drop policy if exists "Portal lee perfil del freelancer" on public.perfiles;
drop policy if exists "Portal lee proyectos de su token" on public.proyectos;
drop policy if exists "Portal lee tareas de su token" on public.tareas;
drop policy if exists "Portal aprueba tareas de su token" on public.tareas;
drop policy if exists "Portal lee facturas de su token" on public.facturas;
drop policy if exists "Portal lee mensajes de su token" on public.portal_mensajes;

-- ── perfiles ───────────────────────────────────────────────
alter table public.perfiles enable row level security;
drop policy if exists "perfiles_propietario" on public.perfiles;
create policy "perfiles_propietario"
  on public.perfiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant all on table public.perfiles to authenticated;
grant all on table public.perfiles to service_role;

-- ── clientes ───────────────────────────────────────────────
alter table public.clientes enable row level security;
drop policy if exists "clientes_propietario" on public.clientes;
create policy "clientes_propietario"
  on public.clientes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant all on table public.clientes to authenticated;
grant all on table public.clientes to service_role;

-- ── proyectos ──────────────────────────────────────────────
alter table public.proyectos enable row level security;
drop policy if exists "proyectos_propietario" on public.proyectos;
create policy "proyectos_propietario"
  on public.proyectos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant all on table public.proyectos to authenticated;
grant all on table public.proyectos to service_role;

-- ── tareas ─────────────────────────────────────────────────
alter table public.tareas enable row level security;
drop policy if exists "tareas_propietario" on public.tareas;
create policy "tareas_propietario"
  on public.tareas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant all on table public.tareas to authenticated;
grant all on table public.tareas to service_role;

-- ── registros_tiempo ───────────────────────────────────────
alter table public.registros_tiempo enable row level security;
drop policy if exists "registros_propietario" on public.registros_tiempo;
create policy "registros_propietario"
  on public.registros_tiempo for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant all on table public.registros_tiempo to authenticated;
grant all on table public.registros_tiempo to service_role;

-- ── facturas ───────────────────────────────────────────────
alter table public.facturas enable row level security;
drop policy if exists "facturas_propietario" on public.facturas;
create policy "facturas_propietario"
  on public.facturas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant all on table public.facturas to authenticated;
grant all on table public.facturas to service_role;

-- ── integraciones (tokens de Google Drive, etc.) ──────────
alter table public.integraciones enable row level security;
drop policy if exists "integraciones_propietario" on public.integraciones;
create policy "integraciones_propietario"
  on public.integraciones for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant all on table public.integraciones to authenticated;
grant all on table public.integraciones to service_role;

-- ── portal_tokens ──────────────────────────────────────────
-- El dueño lee/crea tokens para sus clientes (authenticated).
-- El portal web (anon) lee tokens activos usando el UUID como secreto.
alter table public.portal_tokens enable row level security;
drop policy if exists "portal_tokens_propietario" on public.portal_tokens;
create policy "portal_tokens_propietario"
  on public.portal_tokens for all
  using (
    exists (
      select 1 from public.clientes c
      where c.id = portal_tokens.cliente_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.clientes c
      where c.id = portal_tokens.cliente_id
        and c.user_id = auth.uid()
    )
  );
drop policy if exists "portal_tokens_anon_select" on public.portal_tokens;
create policy "portal_tokens_anon_select"
  on public.portal_tokens for select to anon
  using (activo = true);
grant all on table public.portal_tokens to authenticated;
grant all on table public.portal_tokens to service_role;

-- ── portal_mensajes ────────────────────────────────────────
-- El dueño lee/escribe mensajes de sus proyectos (authenticated).
-- El portal web (anon) lee/escribe mensajes de sus proyectos.
alter table public.portal_mensajes enable row level security;
drop policy if exists "portal_mensajes_propietario" on public.portal_mensajes;
create policy "portal_mensajes_propietario"
  on public.portal_mensajes for all
  using (
    exists (
      select 1 from public.proyectos p
      where p.id = portal_mensajes.proyecto_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.proyectos p
      where p.id = portal_mensajes.proyecto_id
        and p.user_id = auth.uid()
    )
  );
grant all on table public.portal_mensajes to authenticated;
grant all on table public.portal_mensajes to service_role;

-- ── Función helper para el portal ─────────────────────────
-- Devuelve el cliente_id desde el header x-portal-token.
-- Security definer para bypass RLS al leer portal_tokens.
create or replace function public._portal_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pt.cliente_id
  from public.portal_tokens pt
  where pt.token = coalesce(
    current_setting('request.headers', true)::json->>'x-portal-token',
    ''
  )
    and pt.activo = true
  limit 1;
$$;
grant execute on function public._portal_cliente_id() to anon;

-- ── Políticas del portal (anon) ───────────────────────────
-- Cada política usa _portal_cliente_id() para filtrar por el
-- token enviado en el header x-portal-token.

drop policy if exists "clientes_portal_select" on public.clientes;
create policy "clientes_portal_select"
  on public.clientes for select to anon
  using (id = public._portal_cliente_id());

drop policy if exists "perfiles_portal_select" on public.perfiles;
create policy "perfiles_portal_select"
  on public.perfiles for select to anon
  using (
    user_id = (
      select c.user_id from public.clientes c
      where c.id = public._portal_cliente_id()
    )
  );

drop policy if exists "proyectos_portal_select" on public.proyectos;
create policy "proyectos_portal_select"
  on public.proyectos for select to anon
  using (cliente_id = public._portal_cliente_id());

drop policy if exists "tareas_portal_select" on public.tareas;
create policy "tareas_portal_select"
  on public.tareas for select to anon
  using (
    exists (
      select 1 from public.proyectos p
      where p.id = tareas.proyecto_id
        and p.cliente_id = public._portal_cliente_id()
    )
  );

drop policy if exists "tareas_portal_update" on public.tareas;
create policy "tareas_portal_update"
  on public.tareas for update to anon
  using (
    exists (
      select 1 from public.proyectos p
      where p.id = tareas.proyecto_id
        and p.cliente_id = public._portal_cliente_id()
    )
  )
  with check (
    exists (
      select 1 from public.proyectos p
      where p.id = tareas.proyecto_id
        and p.cliente_id = public._portal_cliente_id()
    )
  );

drop policy if exists "facturas_portal_select" on public.facturas;
create policy "facturas_portal_select"
  on public.facturas for select to anon
  using (
    exists (
      select 1 from public.proyectos p
      where p.id = facturas.proyecto_id
        and p.cliente_id = public._portal_cliente_id()
    )
  );

drop policy if exists "portal_mensajes_portal_select" on public.portal_mensajes;
create policy "portal_mensajes_portal_select"
  on public.portal_mensajes for select to anon
  using (
    exists (
      select 1 from public.proyectos p
      where p.id = portal_mensajes.proyecto_id
        and p.cliente_id = public._portal_cliente_id()
    )
  );

drop policy if exists "portal_mensajes_portal_insert" on public.portal_mensajes;
create policy "portal_mensajes_portal_insert"
  on public.portal_mensajes for insert to anon
  with check (
    exists (
      select 1 from public.proyectos p
      where p.id = portal_mensajes.proyecto_id
        and p.cliente_id = public._portal_cliente_id()
    )
  );

-- ── Realtime ──────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'portal_mensajes'
  ) then
    alter publication supabase_realtime add table public.portal_mensajes;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tareas'
  ) then
    alter publication supabase_realtime add table public.tareas;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'contratos'
  ) then
    alter publication supabase_realtime add table public.contratos;
  end if;
end $$;
