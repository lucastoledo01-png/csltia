import { renderOpenDesignSlides } from '../src/lib/server/social/instagram/opendesign-renderer';
import fs from 'fs';
import path from 'path';

async function run() {
  const artifactDir = '/Users/lucastoledo/.gemini/antigravity/brain/a978a197-f080-4632-8768-4d33d59adb7e';

  // Sample 1: Cover Type 1 (News Speaker Photo & Overlay)
  const coverType1Carousel = {
    title: 'A Anthropic lançou uma sequência de atualizações no Claude essa semana',
    primary_topic: 'ANTHROPIC',
    slides: [
      {
        index: 1,
        type: 'cover',
        title: 'A Anthropic lançou uma sequência de atualizações no Claude essa semana.',
        eyebrow: 'BUGNEWS',
        bg_image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1080&q=80'
      }
    ]
  };

  // Sample 2: Cover Type 2 (Editorial Paper & Mixed Serif Italic Typography)
  const coverType2Carousel = {
    title: 'Construa seu próprio "one person business" com essa estrutura no Claude',
    primary_topic: 'PRODUTIVIDADE',
    slides: [
      {
        index: 1,
        type: 'cover',
        title: 'Construa seu próprio "one person business" com essa estrutura no Claude',
        eyebrow: 'ESTRUTURA',
      }
    ]
  };

  // Sample 3: Internal Flow Diagram Slide (Claude -> Cloudflare MCP)
  const diagramCarousel = {
    title: 'Eles se conectam em poucos cliques',
    primary_topic: 'AUTOMAÇÃO',
    slides: [
      {
        index: 2,
        type: 'content',
        title: 'Eles se conectam em poucos cliques.',
        body: 'Sem Zapier. Sem API keys. Sem código. Por meio de um MCP da Cloudflare.',
        eyebrow: '01 / CONEXÃO',
        bullet_points: [
          'Configurações > Conectores > Adicionar conector personalizado',
          'Cole o link do MCP da Cloudflare e clique em Salvar'
        ]
      }
    ]
  };

  console.log('Rendering Thales Laray style previews...');
  const slides1 = await renderOpenDesignSlides(coverType1Carousel as any);
  fs.writeFileSync(path.join(artifactDir, 'thales_cover_type1.png'), slides1[0].pngBuffer);
  console.log('Saved thales_cover_type1.png');

  const slides2 = await renderOpenDesignSlides(coverType2Carousel as any);
  fs.writeFileSync(path.join(artifactDir, 'thales_cover_type2.png'), slides2[0].pngBuffer);
  console.log('Saved thales_cover_type2.png');

  const slides3 = await renderOpenDesignSlides(diagramCarousel as any);
  fs.writeFileSync(path.join(artifactDir, 'thales_diagram_slide.png'), slides3[0].pngBuffer);
  console.log('Saved thales_diagram_slide.png');
}

run();
