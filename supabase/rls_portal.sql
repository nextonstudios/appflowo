-- ============================================================
-- Políticas RLS para el portal web (anon key)
-- El portal usa el header x-portal-token para autenticación.
-- Ejecutar en Supabase Dashboard > SQL Editor > Run
--
-- Este archivo es idempotente: limpia políticas rotas anteriores
-- y crea las correctas usando la función _portal_cliente_id().
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

-- ── Función helper ─────────────────────────────────────────
-- Devuelve el cliente_id asociado al token del header.
-- Es security definer para poder leer portal_tokens sin RLS.

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

-- ── portal_tokens ──────────────────────────────────────────
-- Anon puede leer tokens activos.
-- El token UUID es el secreto (2^128 posibilidades).

drop policy if exists "portal_tokens_anon_select" on public.portal_tokens;
create policy "portal_tokens_anon_select"
  on public.portal_tokens for select to anon
  using (activo = true);

-- ── clientes ───────────────────────────────────────────────
-- Anon puede leer solo el registro de su propio cliente.

drop policy if exists "clientes_portal_select" on public.clientes;
create policy "clientes_portal_select"
  on public.clientes for select to anon
  using (id = public._portal_cliente_id());

-- ── perfiles ───────────────────────────────────────────────
-- Anon puede leer el perfil del dueño (freelancer) de su cliente.

drop policy if exists "perfiles_portal_select" on public.perfiles;
create policy "perfiles_portal_select"
  on public.perfiles for select to anon
  using (
    user_id = (
      select c.user_id from public.clientes c
      where c.id = public._portal_cliente_id()
    )
  );

-- ── proyectos ──────────────────────────────────────────────
-- Anon puede leer proyectos que pertenezcan a su cliente.

drop policy if exists "proyectos_portal_select" on public.proyectos;
create policy "proyectos_portal_select"
  on public.proyectos for select to anon
  using (cliente_id = public._portal_cliente_id());

-- ── tareas ─────────────────────────────────────────────────
-- Anon puede leer tareas de proyectos de su cliente.

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

-- Anon puede actualizar aprobación de tareas de su cliente.

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

-- ── facturas ───────────────────────────────────────────────
-- Anon puede leer facturas de proyectos de su cliente.

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

-- ── portal_mensajes ────────────────────────────────────────
-- Anon puede leer mensajes de proyectos de su cliente.

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

-- Anon puede insertar mensajes en proyectos de su cliente.

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
