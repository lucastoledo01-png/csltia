import { renderOpenDesignSlides } from '../src/lib/server/social/instagram/opendesign-renderer';
import fs from 'fs';
import path from 'path';

async function run() {
  const artifactDir = '/Users/lucastoledo/.gemini/antigravity/brain/a978a197-f080-4632-8768-4d33d59adb7e';

  // Capa 1: Headline Clean + Imagem Chamativa de Fundo (Tema: OpenAI GPT-5)
  const carousel1 = {
    title: 'O GPT-5 foi liberado e mudou as regras do jogo',
    primary_topic: 'OPENAI',
    slides: [
      {
        index: 1,
        type: 'cover',
        cover_variant: 'dark_speaker',
        headline_style: 'clean',
        title: 'O GPT-5 foi liberado e mudou as regras do jogo.',
        bg_image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1080&q=80'
      }
    ]
  };

  // Capa 2: Headline com Risquinho de Sublinhado + Imagem Chamativa de Fundo (Tema: Anthropic Claude)
  const carousel2 = {
    title: 'A Anthropic criou a IA mais inteligente do planeta',
    primary_topic: 'ANTHROPIC',
    slides: [
      {
        index: 1,
        type: 'cover',
        cover_variant: 'dark_speaker',
        headline_style: 'underline_stroke',
        highlight_text: 'mais inteligente',
        title: 'A Anthropic criou a IA mais inteligente do planeta.',
        bg_image_url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=1080&q=80'
      }
    ]
  };

  // Capa 3: Headline com Highlight de Caneta Marker + Imagem Chamativa de Fundo (Tema: Meta Llama 4)
  const carousel3 = {
    title: 'O novo modelo da Meta é 100% gratuito e supera o ChatGPT',
    primary_topic: 'META',
    slides: [
      {
        index: 1,
        type: 'cover',
        cover_variant: 'dark_speaker',
        headline_style: 'pen_highlight',
        highlight_text: 'supera o ChatGPT',
        title: 'O novo modelo da Meta é 100% gratuito e supera o ChatGPT.',
        bg_image_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=1080&q=80'
      }
    ]
  };

  console.log('Rendering 3 Clean Covers with headlines and high-impact background images...');
  const res1 = await renderOpenDesignSlides(carousel1 as any);
  fs.writeFileSync(path.join(artifactDir, 'clean_cover_1_standard.png'), res1[0].pngBuffer);
  console.log('Saved clean_cover_1_standard.png');

  const res2 = await renderOpenDesignSlides(carousel2 as any);
  fs.writeFileSync(path.join(artifactDir, 'clean_cover_2_underline.png'), res2[0].pngBuffer);
  console.log('Saved clean_cover_2_underline.png');

  const res3 = await renderOpenDesignSlides(carousel3 as any);
  fs.writeFileSync(path.join(artifactDir, 'clean_cover_3_pen_highlight.png'), res3[0].pngBuffer);
  console.log('Saved clean_cover_3_pen_highlight.png');
}

run();
