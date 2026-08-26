-- Configurar Bucket Publico de Assets no Supabase Storage para os Slides do Instagram
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('public_assets', 'public_assets', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Politicas RLS para permitir upload e leitura publica
CREATE POLICY "Public Read Access for Assets" ON storage.objects
FOR SELECT USING (bucket_id = 'public_assets');

CREATE POLICY "Service Role Upload Access for Assets" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'public_assets');
