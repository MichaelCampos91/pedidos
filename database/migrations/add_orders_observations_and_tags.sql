-- Add observations and tags columns to orders table
-- observations: for concatenating notes like "#Pagamento aprovado manualmente em: [timestamp]."
-- tags: comma-separated or JSON array of tags for filtering/organization

ALTER TABLE orders ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tags TEXT;
