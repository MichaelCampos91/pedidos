-- Normaliza CPF/CNPJ já gravados com máscara ou string vazia.
-- O unique de cpf não é parcial: '' colide entre clientes sem CPF; NULL não colide.
-- Linhas cuja forma só-dígitos já pertence a outro cliente ficam como estão,
-- para não estourar o unique. A busca passa a encontrá-las mesmo assim.

UPDATE public.clients
SET cpf = NULL
WHERE cpf IS NOT NULL
  AND regexp_replace(cpf, '\D', '', 'g') = '';

UPDATE public.clients
SET cnpj = NULL
WHERE cnpj IS NOT NULL
  AND regexp_replace(cnpj, '\D', '', 'g') = '';

UPDATE public.clients AS c
SET cpf = regexp_replace(c.cpf, '\D', '', 'g')
WHERE c.cpf IS NOT NULL
  AND c.cpf <> regexp_replace(c.cpf, '\D', '', 'g')
  AND regexp_replace(c.cpf, '\D', '', 'g') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.clients AS o
    WHERE o.id <> c.id
      AND regexp_replace(COALESCE(o.cpf, ''), '\D', '', 'g') = regexp_replace(c.cpf, '\D', '', 'g')
  );

UPDATE public.clients AS c
SET cnpj = regexp_replace(c.cnpj, '\D', '', 'g')
WHERE c.cnpj IS NOT NULL
  AND c.cnpj <> regexp_replace(c.cnpj, '\D', '', 'g')
  AND regexp_replace(c.cnpj, '\D', '', 'g') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.clients AS o
    WHERE o.id <> c.id
      AND regexp_replace(COALESCE(o.cnpj, ''), '\D', '', 'g') = regexp_replace(c.cnpj, '\D', '', 'g')
  );
