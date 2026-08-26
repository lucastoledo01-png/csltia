import { renderOpenDesignSlides } from '../src/lib/server/social/instagram/opendesign-renderer';
import fs from 'fs';
import path from 'path';

async function run() {
  const artifactDir = '/Users/lucastoledo/.gemini/antigravity/brain/a978a197-f080-4632-8768-4d33d59adb7e';

  // Capa Tipo 1: Retrato Escuro Cinematográfico do Palestrante/CEO no Palco (Dario Amodei / Anthropic Keynote)
  const carousel1 = {
    title: 'A Anthropic lançou uma sequência de atualizações no Claude essa semana',
    primary_topic: 'ANTHROPIC',
    slides: [
      {
        index: 1,
        type: 'cover',
        cover_variant: 'dark_speaker',
        title: 'A Anthropic lançou uma sequência de atualizações no Claude essa semana.',
        bg_image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1080&q=80'
      }
    ]
  };

  // Capa Tipo 2: Papel Editorial Claro com Colagem de Fotografia dos CEOs da IA (Sam Altman, Dario Amodei, Sundar Pichai)
  const carousel2 = {
    title: 'Construa seu próprio "one person business" com essa estrutura no Claude',
    primary_topic: 'PRODUTIVIDADE',
    slides: [
      {
        index: 1,
        type: 'cover',
        cover_variant: 'clean_editorial',
        title: 'Construa seu próprio "one person business" com essa estrutura no Claude',
        bg_image_url: ''
      }
    ]
  };

  // Capa Tipo 3: Recorte Fotográfico de Criador / Especialista com Adesivo 3D da Marca (Claude 3D)
  const carousel3 = {
    title: 'Meu arsenal pra criar automações usando o Claude',
    primary_topic: 'AUTOMAÇÃO',
    slides: [
      {
        index: 1,
        type: 'cover',
        cover_variant: 'brand_cutout',
        title: 'Meu arsenal pra criar automações usando o Claude',
        bg_image_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80'
      }
    ]
  };

  console.log('Rendering high-impact famous people cover previews...');
  const res1 = await renderOpenDesignSlides(carousel1 as any);
  fs.writeFileSync(path.join(artifactDir, 'impact_cover_type_1.png'), res1[0].pngBuffer);
  console.log('Saved impact_cover_type_1.png');

  const res2 = await renderOpenDesignSlides(carousel2 as any);
  fs.writeFileSync(path.join(artifactDir, 'impact_cover_type_2.png'), res2[0].pngBuffer);
  console.log('Saved impact_cover_type_2.png');

  const res3 = await renderOpenDesignSlides(carousel3 as any);
  fs.writeFileSync(path.join(artifactDir, 'impact_cover_type_3.png'), res3[0].pngBuffer);
  console.log('Saved impact_cover_type_3.png');
}

run();
