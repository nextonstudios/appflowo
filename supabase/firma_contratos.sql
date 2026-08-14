-- ============================================================
-- Firma de contratos en línea (para el portal del cliente)
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
--
-- Estas funciones permiten al portal (anon key) leer y firmar
-- un contrato usando SOLO el firma_token, sin exponer la tabla.
-- ============================================================

-- Devuelve el contrato público por token de firma (solo datos para mostrar)
create or replace function public.obtener_contrato_por_token(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado json;
begin
  select json_build_object(
    'id', c.id,
    'numero', c.numero,
    'cliente_nombre', c.cliente_nombre,
    'cliente_telefono', c.cliente_telefono,
    'cliente_correo', c.cliente_correo,
    'descripcion', c.descripcion,
    'monto', c.monto,
    'moneda', c.moneda,
    'fecha_inicio', c.fecha_inicio,
    'fecha_fin', c.fecha_fin,
    'fecha_emision', c.fecha_emision,
    'clausulas', c.clausulas,
    'estado', c.estado,
    'firma_usuario', c.firma_usuario,
    'fecha_firma_usuario', c.fecha_firma_usuario,
    'nombre_firmante_cliente', c.nombre_firmante_cliente,
    'fecha_firma_cliente', c.fecha_firma_cliente,
    'prestador', coalesce(nullif(p.marca_nombre, ''), u.raw_user_meta_data ->> 'nombre', ''),
    'email_prestador', u.email
  ) into resultado
  from public.contratos c
  left join public.perfiles p on p.user_id = c.user_id
  left join auth.users u on u.id = c.user_id
  where c.firma_token = p_token
    and c.firma_token is not null
    and c.firma_token <> ''
  limit 1;

  return resultado;
end;
$$;

-- Firma el contrato (actualiza firma del cliente, nombre y estado)
create or replace function public.firmar_contrato(
  p_token text,
  p_nombre_firmante text,
  p_firma_png text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c_id uuid;
  v_numero text;
begin
  select c.id, c.numero into c_id, v_numero
  from public.contratos c
  where c.firma_token = p_token
    and c.firma_token is not null
    and c.firma_token <> ''
    and c.estado <> 'firmado'
  limit 1;

  if c_id is null then
    return json_build_object('ok', false, 'error', 'no_encontrado');
  end if;

  if coalesce(trim(p_nombre_firmante), '') = '' then
    return json_build_object('ok', false, 'error', 'nombre_requerido');
  end if;

  if coalesce(p_firma_png, '') = '' then
    return json_build_object('ok', false, 'error', 'firma_requerida');
  end if;

  update public.contratos
  set firma_cliente = p_firma_png,
      nombre_firmante_cliente = trim(p_nombre_firmante),
      fecha_firma_cliente = to_char(current_date, 'YYYY-MM-DD'),
      estado = 'firmado'
  where id = c_id;

  return json_build_object('ok', true, 'id', c_id, 'numero', v_numero);
end;
$$;

-- Permisos para el portal (anon key)
grant execute on function public.obtener_contrato_por_token(text) to anon, authenticated;
grant execute on function public.firmar_contrato(text, text, text) to anon, authenticated;

-- Habilitar tiempo real para contratos (necesario para que la app de
-- escritorio detecte la firma remota y lance la notificación).
-- Solo se agrega si aún no está en la publicación.
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

-- Garantiza que cada contrato tenga un token de firma distinto
-- (evita colisiones entre enlaces). Solo aplica a tokens no vacíos.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where tablename = 'contratos'
      and indexname = 'contratos_firma_token_unique'
  ) then
    create unique index contratos_firma_token_unique
      on public.contratos (firma_token)
      where firma_token is not null;
  end if;
end $$;
