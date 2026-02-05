-- ============================================
-- Seed: Clientes
-- ============================================
-- Inserir clientes de exemplo com dados variados
-- Inclui mix de CPF e CNPJ, alguns com integração Bling simulada

-- Inserir clientes pessoa física (CPF)
INSERT INTO clients (cpf, cnpj, name, email, phone, whatsapp, bling_contact_id) VALUES
('12345678901', NULL, 'João Silva', 'joao.silva@exemplo.com', '(11) 98765-4321', '(11) 98765-4321', NULL),
('23456789012', NULL, 'Maria Santos', 'maria.santos@exemplo.com', '(11) 97654-3210', '(11) 97654-3210', 123456),
('34567890123', NULL, 'Pedro Oliveira', 'pedro.oliveira@exemplo.com', '(21) 98765-4321', '(21) 98765-4321', NULL),
('45678901234', NULL, 'Ana Costa', 'ana.costa@exemplo.com', '(11) 96543-2109', '(11) 96543-2109', 123457),
('56789012345', NULL, 'Carlos Souza', 'carlos.souza@exemplo.com', '(11) 95432-1098', '(11) 95432-1098', NULL)
ON CONFLICT (cpf) DO NOTHING;

-- Inserir clientes pessoa jurídica (CNPJ)
INSERT INTO clients (cpf, cnpj, name, email, phone, whatsapp, bling_contact_id) VALUES
(NULL, '12345678000190', 'Empresa ABC Ltda', 'contato@empresaabc.com.br', '(11) 3456-7890', '(11) 98765-4321', 123458),
(NULL, '23456789000101', 'Comércio XYZ EIRELI', 'vendas@comercioxyz.com.br', '(21) 3456-7890', '(21) 98765-4321', NULL),
(NULL, '34567890000112', 'Serviços Tech ME', 'contato@servicostech.com.br', '(11) 3456-7891', '(11) 98765-4322', 123459)
ON CONFLICT (cnpj) DO NOTHING;

-- Inserir endereços para alguns clientes (apenas se não existirem)
INSERT INTO client_addresses (client_id, cep, street, number, complement, neighborhood, city, state, is_default)
SELECT 
  c.id,
  '01310100',
  'Avenida Paulista',
  '1578',
  'Sala 101',
  'Bela Vista',
  'São Paulo',
  'SP',
  true
FROM clients c 
WHERE c.email = 'joao.silva@exemplo.com'
  AND NOT EXISTS (
    SELECT 1 FROM client_addresses ca 
    WHERE ca.client_id = c.id AND ca.cep = '01310100'
  );

INSERT INTO client_addresses (client_id, cep, street, number, neighborhood, city, state, is_default)
SELECT 
  c.id,
  '20040020',
  'Avenida Rio Branco',
  '185',
  'Centro',
  'Rio de Janeiro',
  'RJ',
  true
FROM clients c 
WHERE c.email = 'pedro.oliveira@exemplo.com'
  AND NOT EXISTS (
    SELECT 1 FROM client_addresses ca 
    WHERE ca.client_id = c.id AND ca.cep = '20040020'
  );

INSERT INTO client_addresses (client_id, cep, street, number, complement, neighborhood, city, state, is_default)
SELECT 
  c.id,
  '01310100',
  'Rua Augusta',
  '2000',
  'Apto 45',
  'Consolação',
  'São Paulo',
  'SP',
  true
FROM clients c 
WHERE c.email = 'maria.santos@exemplo.com'
  AND NOT EXISTS (
    SELECT 1 FROM client_addresses ca 
    WHERE ca.client_id = c.id AND ca.cep = '01310100' AND ca.street = 'Rua Augusta'
  );

INSERT INTO client_addresses (client_id, cep, street, number, neighborhood, city, state, is_default)
SELECT 
  c.id,
  '30130100',
  'Avenida Afonso Pena',
  '3000',
  'Centro',
  'Belo Horizonte',
  'MG',
  true
FROM clients c 
WHERE c.cnpj = '12345678000190'
  AND NOT EXISTS (
    SELECT 1 FROM client_addresses ca 
    WHERE ca.client_id = c.id AND ca.cep = '30130100'
  );
