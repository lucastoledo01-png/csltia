import { renderOpenDesignSlides } from '../src/lib/server/social/instagram/opendesign-renderer';
import fs from 'fs';
import path from 'path';

async function run() {
  const artifactDir = '/Users/lucastoledo/.gemini/antigravity/brain/a978a197-f080-4632-8768-4d33d59adb7e';

  // Capa Tipo 1: Retrato Editorial Dark Speaker (Speaker / Autor / CEO com perfil verificado)
  const carousel1 = {
    title: 'A Anthropic lançou uma sequência de atualizações no Claude essa semana',
    primary_topic: 'ANTHROPIC',
    slides: [
      {
        index: 1,
        type: 'cover',
        cover_variant: 'dark_speaker',
        title: 'A Anthropic lançou uma sequência de atualizações no Claude essa semana.',
        bg_image_url: 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
          <rect width="1080" height="1350" fill="#0A0A0C"/>
          <circle cx="540" cy="450" r="300" fill="#FF4A1C" opacity="0.25"/>
          <text x="540" y="500" font-size="120" text-anchor="middle" fill="#FFFFFF" opacity="0.8">🎙️</text>
        </svg>`).toString('base64')
      }
    ]
  };

  // Capa Tipo 2: Papel Editorial Claro com Destaque "Serif Italic" no Titulo + Ícone Laranja
  const carousel2 = {
    title: 'Construa seu próprio "one person business" com essa estrutura no Claude',
    primary_topic: 'PRODUTIVIDADE',
    slides: [
      {
        index: 1,
        type: 'cover',
        cover_variant: 'clean_editorial',
        title: 'Construa seu próprio "one person business" com essa estrutura no Claude',
        bg_image_url: 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="500">
          <rect width="1080" height="500" fill="#EAE8E3" rx="24"/>
          <circle cx="540" cy="250" r="140" fill="#D96B52" opacity="0.3"/>
          <text x="540" y="270" font-size="90" text-anchor="middle" fill="#18181B">👥 💼</text>
        </svg>`).toString('base64')
      }
    ]
  };

  // Capa Tipo 3: Recorte de Pessoas / CEOs (Cutout Person + Anotações / Sticker)
  const carousel3 = {
    title: 'Meu arsenal pra criar automações usando o Claude',
    primary_topic: 'AUTOMAÇÃO',
    slides: [
      {
        index: 1,
        type: 'cover',
        cover_variant: 'brand_cutout',
        title: 'Meu arsenal pra criar automações usando o Claude',
        bg_image_url: 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="680">
          <rect width="1080" height="680" fill="#F4F3EF" rx="24"/>
          <circle cx="540" cy="340" r="180" fill="#FF4A1C" opacity="0.2"/>
          <text x="540" y="370" font-size="140" text-anchor="middle">⚡ 🤖</text>
        </svg>`).toString('base64')
      }
    ]
  };

  console.log('Rendering all 3 Cover Types based on reference images...');
  const res1 = await renderOpenDesignSlides(carousel1 as any);
  fs.writeFileSync(path.join(artifactDir, 'cover_pattern_type_1.png'), res1[0].pngBuffer);
  console.log('Saved cover_pattern_type_1.png');

  const res2 = await renderOpenDesignSlides(carousel2 as any);
  fs.writeFileSync(path.join(artifactDir, 'cover_pattern_type_2.png'), res2[0].pngBuffer);
  console.log('Saved cover_pattern_type_2.png');

  const res3 = await renderOpenDesignSlides(carousel3 as any);
  fs.writeFileSync(path.join(artifactDir, 'cover_pattern_type_3.png'), res3[0].pngBuffer);
  console.log('Saved cover_pattern_type_3.png');
}

run();
