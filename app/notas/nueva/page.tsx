-- v14 - Recuperar las tarifas de los productos de una nota ya guardada
-- Al editar una nota, la pantalla necesita volver a saber los cuatro
-- precios de cada producto para poder ofrecer contado / credito.

create or replace function products_prices(p_ids uuid[])
returns table (
  id uuid,
  code text,
  price_1 numeric,
  price_2 numeric,
  price_3 numeric,
  price_4 numeric,
  cost numeric
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.code, p.price_1, p.price_2, p.price_3, p.price_4, p.cost
  from products p
  where p.id = any(coalesce(p_ids, array[]::uuid[]));
$$;

grant execute on function products_prices(uuid[]) to authenticated;
