-- Corrige a politica de upload do bucket public_assets.
--
-- A politica original foi criada sem clausula TO:
--
--   CREATE POLICY "Service Role Upload Access for Assets" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'public_assets');
--
-- Sem TO, o Postgres aplica a politica a PUBLIC — todos os papeis, incluindo
-- anon. O nome dizia "Service Role" mas o efeito era upload anonimo liberado
-- num bucket publico servido a partir do dominio do projeto.
--
-- Aqui as politicas sao recriadas com escopo explicito de papel. Os comandos
-- sao idempotentes para que a migracao possa ser reaplicada sem erro.

DROP POLICY IF EXISTS "Service Role Upload Access for Assets" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Access for Assets" ON storage.objects;

-- Leitura publica: intencional, os slides precisam ser buscados pela Meta.
CREATE POLICY "Public Read Access for Assets"
ON storage.objects
FOR SELECT
TO anon, authenticated, service_role
USING (bucket_id = 'public_assets');

-- Escrita apenas pelo papel de servico. A chave de servico ja ignora RLS, mas
-- a politica explicita documenta a intencao e evita que uma mudanca futura de
-- privilegios reabra o bucket para anon.
CREATE POLICY "Service Role Upload Access for Assets"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'public_assets');

CREATE POLICY "Service Role Update Access for Assets"
ON storage.objects
FOR UPDATE
TO service_role
USING (bucket_id = 'public_assets')
WITH CHECK (bucket_id = 'public_assets');

CREATE POLICY "Service Role Delete Access for Assets"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'public_assets');
