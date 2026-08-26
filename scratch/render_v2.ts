import { renderOpenDesignSlides } from '../src/lib/server/social/instagram/opendesign-renderer';
import fs from 'fs';
import path from 'path';

async function run() {
  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0F172A"/>
        <stop offset="40%" stop-color="#1E1B4B"/>
        <stop offset="100%" stop-color="#020617"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="35%" r="60%">
        <stop offset="0%" stop-color="#FF4A1C" stop-opacity="0.5"/>
        <stop offset="50%" stop-color="#6366F1" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <circle cx="540" cy="450" r="380" fill="url(#glow)"/>
    <g transform="translate(540, 480)">
      <polygon points="0,-180 150,-50 150,150 0,220 -150,150 -150,-50" fill="none" stroke="#FF4A1C" stroke-width="5" opacity="0.7"/>
      <polygon points="0,-130 110,-30 110,100 0,160 -110,100 -110,-30" fill="none" stroke="#818CF8" stroke-width="4" opacity="0.9"/>
      <circle cx="0" cy="0" r="45" fill="#FF4A1C"/>
    </g>
  </svg>`;

  const heroImageBase64 = 'data:image/svg+xml;base64,' + Buffer.from(bgSvg).toString('base64');

  const anthropicCarousel = {
    title: 'Anthropic lança Claude 3.7 Sonnet com raciocínio híbrido',
    edition_date: '2026-08-26',
    primary_topic: 'INTELIGÊNCIA ARTIFICIAL',
    target_audience_focus: 'Criadores, Vendedores & Empreendedores',
    slides: [
      {
        index: 1,
        type: 'cover',
        title: 'Anthropic lança nova IA que pensa como humano antes de responder',
        body: 'O modelo que promete ultrapassar o ChatGPT em respostas complexas.',
        eyebrow: 'BUGNEWS',
        bg_image_url: heroImageBase64
      },
      {
        index: 2,
        type: 'intro',
        title: 'O que isso muda na sua rotina?',
        body: 'Sabe quando você faz uma pergunta difícil para a IA e ela te dá uma resposta genérica ou confusa? A Anthropic criou um novo modelo que literalmente para por alguns segundos para raciocinar antes de te responder. É como ter um especialista sênior ao seu lado.',
        eyebrow: '01 / CONTEXTO'
      },
      {
        index: 3,
        type: 'content',
        title: 'Por que ela é tão diferente?',
        body: 'Você não precisa mais escolher entre uma IA rápida e uma IA inteligente. Ela faz os dois no mesmo lugar.',
        eyebrow: '02 / RECURSOS',
        bullet_points: [
          '⚡ Respostas em 1 segundo para dúvidas rápidas do dia a dia',
          '🧠 Modo Raciocínio: ela pensa em silêncio antes de resolver problemas complexos',
          '📊 Entende fotos, gráficos e PDFs com precisão cirúrgica'
        ]
      },
      {
        index: 4,
        type: 'practical_impact',
        title: 'Como usar para ganhar tempo hoje',
        body: 'Você pode colocar a IA para analisar planilhas de vendas, montar estratégias de conteúdo para a semana inteira ou até criar scripts de atendimento sem errar nada.',
        eyebrow: '03 / APLICAÇÃO'
      },
      {
        index: 5,
        type: 'cta',
        title: 'Quer o passo a passo completo no seu Direct?',
        body: 'Comente a palavra NEWS aqui nos comentários que te enviamos o tutorial e a newsletter de hoje no seu Direct!',
        cta_text: '💬 COMENTE NEWS PARA RECEBER',
        eyebrow: 'DESBUGUEI.IA'
      }
    ],
    caption: {
      headline: '🚨 Anthropic lança a IA que pensa antes de falar! Veja como usar ⬇️',
      intro_summary: 'Sabe quando a IA erra uma resposta simples ou te enrola? Essa nova atualização veio pra resolver isso de vez.',
      key_takeaways: [
        '🧠 Modo Raciocínio que resolve problemas difíceis em segundos',
        '⚡ Respostas ultrarrápidas para tarefas do dia a dia',
        '📈 Análise perfeita de fotos, relatórios e estratégias de vendas'
      ],
      cta_call: '👇 Comente NEWS aqui nos comentários que te enviamos a análise completa e a newsletter gratuita direto no seu Direct!',
      hashtags: ['#inteligenciaartificial', '#claude37', '#anthropic', '#desbuguei', '#marketingdigital', '#produtividade', '#vendascomia'],
      full_caption: `🚨 Anthropic lança a IA que pensa antes de falar! Veja como usar ⬇️

Sabe quando a IA erra uma resposta simples ou te enrola? A Anthropic acabou de lançar o Claude 3.7 Sonnet para resolver isso de vez.

O que muda pra você:
🧠 Modo Raciocínio que resolve problemas difíceis em segundos
⚡ Respostas ultrarrápidas para tarefas do dia a dia
📈 Análise perfeita de fotos, relatórios e estratégias de vendas

👇 Comente NEWS aqui nos comentários que te enviamos o tutorial completo e a newsletter gratuita direto no seu Direct!

#inteligenciaartificial #claude37 #anthropic #desbuguei #marketingdigital #produtividade #vendascomia

Agora você está desbugado.`
    }
  };

  console.log('Rendering all 5 slides...');
  const artifactDir = '/Users/lucastoledo/.gemini/antigravity/brain/a978a197-f080-4632-8768-4d33d59adb7e';
  const slides = await renderOpenDesignSlides(anthropicCarousel as any);

  for (let i = 0; i < slides.length; i++) {
    const outPath = path.join(artifactDir, `claude_v2_slide_${i + 1}.png`);
    fs.writeFileSync(outPath, slides[i].pngBuffer);
    console.log(`Saved claude_v2_slide_${i + 1}.png`);
  }
}

run();
