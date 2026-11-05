import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Uso: node producao-manual/_modelo-reel-foto/gerar_reels.mjs <pasta-com-reels.json> [id]
const RAIZ=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const D=path.resolve(process.argv[2]);const cfg=JSON.parse(readFileSync(path.join(D,"reels.json"),"utf8"));
const LOGO=path.join(RAIZ,"public/marca/eua-instagram-fundo-escuro.png");
const TRILHA=path.resolve(D,cfg.trilha);const F=path.resolve(D,cfg.fotos);
const R=cfg.reels;
// Posição da máscara escura e do bloco de texto, em px do 1080x1920. Em 30/10/2026 era
// máscara a partir de y 800 e texto com a base a 530 px do fim. Em 05/11/2026 o dono pediu os
// dois 10% mais baixos (192 px): 15% punha a manchete debaixo da legenda e dos botões do Reels.
const MASCARA=cfg.mascara??992, BASE_DO_TEXTO=cfg.baseDoTexto??338;
const b=await chromium.launch();
for(const id of (process.argv[3]?[process.argv[3]]:Object.keys(R))){
 const c=R[id];
 if(c.bolha){execFileSync("ffmpeg",["-v","error","-y","-i",path.resolve(F,c.bolha.foto),"-vf",`crop=${c.bolha.crop},scale=600:600:flags=lanczos`,"-frames:v","1",`${D}/bolha_${id}.jpg`]);}
 const html=`<!doctype html><meta charset=utf-8><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800&display=swap" rel="stylesheet"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent}body{width:1080px;height:1920px;position:relative;overflow:hidden;font-family:Inter}
#top{position:absolute;left:0;right:0;top:0;height:560px;background:linear-gradient(180deg,rgba(0,0,0,.5),rgba(0,0,0,0))}
#bot{position:absolute;left:0;right:0;top:${MASCARA}px;height:${1920-MASCARA}px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.8) 38%,rgba(0,0,0,.6) 70%,rgba(0,0,0,.25))}
#logo{position:absolute;left:100px;top:312px;width:210px}
#bolha{position:absolute;width:300px;height:300px;border-radius:50%;border:7px solid #fff;object-fit:cover;box-shadow:0 6px 30px rgba(0,0,0,.35)}
#blk{position:absolute;left:100px;width:840px;bottom:${BASE_DO_TEXTO}px}
#cat{display:inline-block;color:#fff;font-weight:800;font-size:24px;letter-spacing:.14em;margin-bottom:22px}
#hd{color:#fff;font-weight:800;font-size:66px;line-height:1.1;text-transform:uppercase;letter-spacing:-.01em}
#hd em{font-style:normal;color:#ff3b53}
#rod{display:flex;justify-content:space-between;margin-top:30px;color:rgba(255,255,255,.78);font-weight:500;font-size:25px}
</style><div id=top></div><div id=bot></div><img id=logo src="file://${LOGO}">${c.bolha?`<img id=bolha src="file://${D}/bolha_${id}.jpg" style="left:${c.bolha.x??640}px;top:${c.bolha.y??300}px">`:""}
<div id=blk><div id=cat>${c.cat}</div><div id=hd>${c.h}</div></div>`;
 writeFileSync(`${D}/o_${id}.html`,html);
 const p=await b.newPage({viewport:{width:1080,height:1920}});
 await p.goto(`file://${D}/o_${id}.html`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
 // o título não pode passar da largura segura nem de 5 linhas
 const n=await p.evaluate(()=>Math.round(document.getElementById('hd').getBoundingClientRect().height/72));
 console.log(id,"linhas ~",n);
 await p.screenshot({path:`${D}/o_${id}.png`,omitBackground:true});await p.close();
 const dur=10,fps=30,fr=dur*fps;
 // Zoom leve e sem tremida (05/11/2026). O zoompan arredonda o recorte para pixel inteiro a
 // cada quadro, e a imagem tremia; reescalar a foto inteira por quadro tem o mesmo degrau no
 // tamanho. O `perspective` recebe os quatro cantos em fração de pixel e interpola, então o
 // recorte encolhe de forma contínua.
 const z=c.zoom??0.07;
 // A foto desce junto com a sombra e a manchete (05/11/2026), para o rosto continuar na mesma
 // posição em relação ao texto. Primeiro sobe o recorte; se a foto não tem mais nada acima, o
 // que falta no topo vira a própria foto desfocada e escurecida, por baixo da marca.
 const DESCE=c.desceImagem??cfg.desceImagem??0.10;
 const [cw,ch,cx,cy]=c.crop.split(":").map(Number);
 const falta=Math.round(DESCE*ch);
 const sobe=Math.min(cy,falta), resto=falta-sobe;
 const crop=`${cw}:${ch}:${cx}:${cy-sobe}`;
 const topo=Math.round(resto/ch*3840/2)*2;
 // Com falta no topo, a foto composta é montada UMA vez (desfoque por baixo e a foto por cima,
 // com a borda de cima esfumada em 160 px, para não ficar uma linha de corte).
 let entrada=`${F}/${c.foto}`, base=`[0:v]crop=${crop},scale=2160:3840:flags=lanczos,`;
 if(topo>0){
  const comp=`${D}/fundo_${id}.png`;
  execFileSync("ffmpeg",["-v","error","-y","-i",`${F}/${c.foto}`,"-filter_complex",
   `[0:v]crop=${crop},scale=2160:3840:flags=lanczos,split[f][b];[b]boxblur=40:2,eq=brightness=-0.18[bb];[f]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(Y,160),255*Y/160,255)'[fa];[bb][fa]overlay=0:${topo}`,
   "-frames:v","1",comp]);
  entrada=comp; base=`[0:v]`;
 }
 // Os cantos entram no quadro, e o recorte aproxima: 7% em 10 s, o mesmo zoom de antes.
 const P=`W/2*(1-1/(1+${z}*in/${fr}))`,Q=`H/2*(1-1/(1+${z}*in/${fr}))`;
 execFileSync("ffmpeg",["-v","error","-y","-loop","1","-framerate",String(fps),"-t",String(dur),"-i",entrada,"-i",`${D}/o_${id}.png`,"-i",TRILHA,
  "-filter_complex",`${base}perspective=x0='${P}':y0='${Q}':x1='W-${P}':y1='${Q}':x2='${P}':y2='H-${Q}':x3='W-${P}':y3='H-${Q}':interpolation=cubic:eval=frame,scale=1080:1920:flags=area,format=yuv420p[v];[v][1:v]overlay=0:0,format=yuv420p[o];[2:a]volume=0.55,afade=t=in:d=0.4,afade=t=out:st=9:d=1[a]`,
  "-map","[o]","-map","[a]","-t",String(dur),"-c:v","libx264","-crf","18","-preset","medium","-c:a","aac","-b:a","160k","-movflags","+faststart",`${D}/reel_${id}.mp4`]);
 console.log("ok",id);
}
await b.close();
