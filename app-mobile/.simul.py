# -*- coding: utf-8 -*-
"""Simule la chirurgie des déclinaisons sur le corps DÉPLOYÉ, hors production.

On ne devine pas ce que la fonction deviendra : on le fabrique ici et on le lit.
"""
import io
import os
import re

TMP = os.environ.get('TEMP', '.')

V_SEL = ('select p.id, p.shop_id, p.title, p.photos, p.price_minor, p.status, '
         'p.stock, s.owner_id')
V_DECL = 'v_item             jsonb;'
V_STOCK = 'if v_product.stock is not null then'

STOCK_BLOCK = """v_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;
    if v_product.has_variants then
      if v_variant_id is null then raise exception 'VARIANT_REQUIRED'; end if;
      select v.id, v.stock, v.size, v.color into v_variant
        from public.product_variants v
       where v.id = v_variant_id
         and v.product_id = v_product.id
         and v.status = 'active'
       for update;
      if not found then raise exception 'VARIANT_NOT_FOUND'; end if;
      if v_variant.stock is not null then
        if v_variant.stock <= 0 then raise exception 'OUT_OF_STOCK'; end if;
        if v_qty > v_variant.stock then raise exception 'INSUFFICIENT_STOCK'; end if;
        update public.product_variants set stock = stock - v_qty where id = v_variant.id;
      end if;
      v_variant_label := nullif(trim(both ' · ' from
        coalesce(v_variant.size, '') || ' · ' || coalesce(v_variant.color, '')), '');
    elsif v_variant_id is not null then
      raise exception 'VARIANT_UNEXPECTED';
    elsif v_product.stock is not null then"""

for name, snap in (('pom_live.sql', "'title', v_product.title,"),
                   ('pob_live.sql', "'title',    v_product.title,")):
    path = os.path.join(TMP, name)
    src = io.open(path, encoding='utf-8').read()

    for label, anchor in (('SELECT', V_SEL), ('DECLARE', V_DECL),
                          ('STOCK', V_STOCK), ('SNAPSHOT', snap)):
        n = src.count(anchor)
        assert n == 1, (name, label, n)

    out = src.replace(V_SEL, V_SEL.replace('p.stock,', 'p.stock, p.has_variants,'))
    out = out.replace(V_DECL, V_DECL + '\n  v_variant          record;'
                               '\n  v_variant_id       uuid;'
                               '\n  v_variant_label    text;')
    out = out.replace(V_STOCK, STOCK_BLOCK)
    out = out.replace(snap, snap + "\n        'variantId', v_variant_id,"
                                   "\n        'variantLabel', v_variant_label,")

    io.open(os.path.join(TMP, 'SIM_' + name), 'w', encoding='utf-8', newline='').write(out)

    # Equilibre des if/end if du corps entier — un elsif mal place se verrait ici.
    body = out
    n_if = len(re.findall(r'(?<![\w.])if\s', body)) - len(re.findall(r'(?<![\w.])elsif\s', body))
    n_end = len(re.findall(r'end if\s*;', body))
    print('%-14s  if=%d  end if=%d  %s' % (name, n_if, n_end,
                                           'EQUILIBRE' if n_if == n_end else '*** DESEQUILIBRE ***'))
    for g in ('VARIANT_REQUIRED', 'VARIANT_NOT_FOUND', 'OUT_OF_STOCK',
              'INSUFFICIENT_STOCK', 'has_variants', 'variantId', 'kind'):
        assert g in out, (name, g)
    print('   gardes presentes, simulation ecrite dans SIM_' + name)
