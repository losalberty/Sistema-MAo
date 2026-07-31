-- Funciones que la app usa para hablar con la base de datos.
-- Se ejecutan "security definer": funcionan aunque la tabla este protegida
-- por RLS, porque son puertas controladas por nosotros, no acceso libre.
-- Pega y corre esto en el SQL Editor de Supabase, DESPUES de haber creado
-- las tablas (schema.sql).

-- 1) Buscar productos tolerando errores de tipeo (usa pg_trgm)
create or replace function search_products(search_text text)
returns setof products
language sql
security definer
set search_path = public
as $$
  select *
  from products
  where description % search_text
     or code % search_text
     or description ilike '%' || search_text || '%'
     or code ilike '%' || search_text || '%'
  order by greatest(similarity(description, search_text), similarity(code, search_text)) desc
  limit 10;
$$;

grant execute on function search_products(text) to anon, authenticated;

-- 2) Listar clientes (para el buscador de cliente en la nota)
create or replace function list_clients(search_text text default '')
returns setof clients
language sql
security definer
set search_path = public
as $$
  select *
  from clients
  where search_text = '' or name ilike '%' || search_text || '%'
  order by name
  limit 20;
$$;

grant execute on function list_clients(text) to anon, authenticated;

-- 3) Crear una nota completa (cabecera + lineas) en un solo paso
create or replace function create_note(
  p_client_id uuid,
  p_quick_client_name text,
  p_currency_mode text,
  p_exchange_rate numeric,
  p_exchange_gap_percent numeric,
  p_show_company_name boolean,
  p_show_logo boolean,
  p_discount numeric,
  p_items jsonb -- [{product_id, code_snapshot, description_snapshot, quantity, unit_price, line_discount, line_total}]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note_id uuid;
  v_subtotal numeric := 0;
  v_item jsonb;
begin
  select coalesce(sum((i->>'line_total')::numeric), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) as i;

  insert into notes (
    client_id, quick_client_name, currency_mode, exchange_rate,
    exchange_gap_percent, show_company_name, show_logo, subtotal,
    discount, total
  ) values (
    p_client_id, p_quick_client_name, p_currency_mode, p_exchange_rate,
    p_exchange_gap_percent, p_show_company_name, p_show_logo, v_subtotal,
    p_discount, v_subtotal - p_discount
  ) returning id into v_note_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into note_items (
      note_id, product_id, code_snapshot, description_snapshot,
      quantity, unit_price, line_discount, line_total
    ) values (
      v_note_id,
      (v_item->>'product_id')::uuid,
      v_item->>'code_snapshot',
      v_item->>'description_snapshot',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      coalesce((v_item->>'line_discount')::numeric, 0),
      (v_item->>'line_total')::numeric
    );
  end loop;

  return v_note_id;
end;
$$;

grant execute on function create_note(uuid, text, text, numeric, numeric, boolean, boolean, numeric, jsonb) to anon, authenticated;
