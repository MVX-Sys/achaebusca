WITH norm AS (
  SELECT p.id,
    lower(translate(coalesce(p.nome,''), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) AS nome,
    lower(translate(coalesce(c.nome,''), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) AS cat,
    lower(translate(coalesce(p.personalizacao_tipo,''), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) AS tipo
  FROM public.produtos p
  LEFT JOIN public.categorias c ON c.id = p.categoria_id
  WHERE p.personalizacoes = '[]'::jsonb
    AND p.criado_em < to_timestamp(1790724892)
), calc AS (
  SELECT id, nome, cat, tipo,
    (nome LIKE '%moletom%' OR nome LIKE '%canguru%' OR nome LIKE '%careca%' OR nome LIKE '%regata%' OR nome LIKE '%oversized%' OR nome LIKE '%oversize%' OR tipo LIKE '%moletom%' OR tipo LIKE '%canguru%' OR tipo LIKE '%careca%' OR tipo LIKE '%regata%' OR tipo LIKE '%oversized%' OR tipo LIKE '%oversize%') AS sem_perso
  FROM norm
), opc AS (
  SELECT id,
  CASE
    WHEN sem_perso THEN '[]'::jsonb
    WHEN nome LIKE '%bermuda%' OR tipo LIKE '%bermuda%' OR cat LIKE '%bermuda%' THEN
      jsonb_build_array(jsonb_build_object('id','bermuda-personalizada','label','Personalizada','preco',5,'grupo','Bermuda'))
    WHEN nome LIKE '%case%' OR nome LIKE '%estojo%' THEN
      jsonb_build_array(jsonb_build_object('id','case','label','Case','preco',1,'grupo','Case'))
    WHEN nome LIKE '%lenco%' THEN
      jsonb_build_array(jsonb_build_object('id','lenco','label','Lenço','preco',1,'grupo','Lenço'))
    WHEN cat LIKE '%oculos%' OR nome LIKE '%oculos%' OR tipo LIKE '%oculos%' THEN
      jsonb_build_array(
        jsonb_build_object('id','oculos-2-hastes','label','2 Hastes','preco',2,'grupo','Óculos'),
        jsonb_build_object('id','oculos-1-haste','label','1 Haste','preco',1,'grupo','Óculos'),
        jsonb_build_object('id','oculos-2-lentes','label','2 Lentes','preco',2,'grupo','Óculos'),
        jsonb_build_object('id','oculos-1-lente','label','1 Lente','preco',1,'grupo','Óculos'),
        jsonb_build_object('id','case','label','Case','preco',1,'grupo','Case'),
        jsonb_build_object('id','lenco','label','Lenço','preco',1,'grupo','Lenço'))
    WHEN cat ~ '(chinelo|sandal|birken|slide|papete|rasteir|tamanco|havaian|flip|anabela)'
      OR nome ~ '(chinelo|sandal|birken|slide|papete|rasteir|tamanco|havaian|flip|anabela)'
      OR tipo ~ '(chinelo|sandal|birken|slide|papete|rasteir|tamanco|havaian|flip|anabela)' THEN
      CASE WHEN nome LIKE '%birken%' OR nome LIKE '%regulagem%' OR tipo LIKE '%birken%' THEN
        jsonb_build_array(
          jsonb_build_object('id','birken-regulagem-par','label','Regulagem no par','preco',1,'grupo','Sandália com regulagem'),
          jsonb_build_object('id','birken-lateral','label','Lateral','preco',1,'grupo','Sandália com regulagem'),
          jsonb_build_object('id','birken-calcanhar','label','Calcanhar','preco',1,'grupo','Sandália com regulagem'))
      ELSE
        jsonb_build_array(
          jsonb_build_object('id','sandalia-pala','label','Pala','preco',2,'grupo','Sandália com pala'),
          jsonb_build_object('id','sandalia-calcanhar','label','Calcanhar','preco',1,'grupo','Sandália com pala'),
          jsonb_build_object('id','sandalia-lateral','label','Lateral','preco',1,'grupo','Sandália com pala'))
      END
    ELSE '[]'::jsonb
  END AS persos
  FROM calc
)
UPDATE public.produtos p
SET personalizacoes = o.persos
FROM opc o
WHERE p.id = o.id AND o.persos <> '[]'::jsonb;