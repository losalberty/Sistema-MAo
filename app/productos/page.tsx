alter table suppliers add column if not exists contact text;
alter table suppliers add column if not exists notes text;

create unique index if not exists suppliers_name_key on suppliers (upper(btrim(name)));


create or replace function list_suppliers()
returns table (id uuid, name text, phone text, contact text, notes text, total bigint)
language sql
security definer
set search_path = public
as $$
  select s.id, s.name, s.phone, s.contact, s.notes,
         (select count(*) from products p where p.supplier_id = s.id) as total
  from suppliers s
  order by s.name;
$$;

grant execute on function list_suppliers() to authenticated;


create or replace function upsert_supplier(
  p_id uuid default null,
  p_name text default '',
  p_phone text default null,
  p_contact text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'El proveedor necesita un nombre';
  end if;

  if p_id is not null then
    update suppliers set
      name = btrim(p_name), phone = p_phone, contact = p_contact, notes = p_notes
    where suppliers.id = p_id
    returning suppliers.id into v_id;
    return v_id;
  end if;

  select s.id into v_id from suppliers s
  where upper(btrim(s.name)) = upper(btrim(p_name));

  if v_id is not null then
    update suppliers set
      phone = coalesce(p_phone, phone),
      contact = coalesce(p_contact, contact),
      notes = coalesce(p_notes, notes)
    where suppliers.id = v_id;
    return v_id;
  end if;

  insert into suppliers (name, phone, contact, notes)
  values (btrim(p_name), p_phone, p_contact, p_notes)
  returning suppliers.id into v_id;

  return v_id;
end;
$$;

grant execute on function upsert_supplier(uuid, text, text, text, text) to authenticated;


create or replace function delete_supplier(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update products set supplier_id = null where supplier_id = p_id;
  delete from suppliers where id = p_id;
$$;

grant execute on function delete_supplier(uuid) to authenticated;


create or replace function set_supplier(p_ids uuid[], p_supplier_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated bigint;
begin
  update products set supplier_id = p_supplier_id
  where id = any(coalesce(p_ids, array[]::uuid[]));
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function set_supplier(uuid[], uuid) to authenticated;


drop function if exists import_costs(jsonb);

create or replace function import_costs(p_items jsonb, p_supplier_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_norm text;
  v_price numeric;
  v_disc numeric;
  v_updated bigint := 0;
  v_orphans bigint := 0;
  v_ignored bigint := 0;
  v_hit int;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_norm := upper(regexp_replace(coalesce(v_item->>'code', ''), '[[:space:]]', '', 'g'));
    continue when v_norm = '';

    v_price := safe_numeric(v_item->>'purchase_price');
    v_disc  := safe_numeric(v_item->>'discount_percent');

    if v_price is null and v_disc is null then
      v_ignored := v_ignored + 1;
      continue;
    end if;

    update products set
      purchase_price   = coalesce(v_price, purchase_price),
      discount_percent = coalesce(v_disc, discount_percent),
      supplier_id      = coalesce(p_supplier_id, supplier_id),
      cost = round(
        coalesce(v_price, purchase_price, 0)
        * (1 - coalesce(v_disc, discount_percent, 0) / 100.0), 2)
    where code_norm = v_norm;

    get diagnostics v_hit = row_count;

    if v_hit > 0 then
      v_updated := v_updated + 1;
    else
      v_orphans := v_orphans + 1;
    end if;
  end loop;

  return jsonb_build_object('updated', v_updated, 'orphans', v_orphans, 'ignored', v_ignored);
end;
$$;

grant execute on function import_costs(jsonb, uuid) to authenticated;
