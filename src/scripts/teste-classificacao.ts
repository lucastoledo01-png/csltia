import fs from "node:fs";
import path from "node:path";
import { classificarPautas } from "../lib/server/editorial/classificador";

for (const arquivo of [".env.local", ".env"]) {
  const caminho = path.resolve(process.cwd(), arquivo);
  if (!fs.existsSync(caminho)) continue;
  for (const linha of fs.readFileSync(caminho, "utf-8").split("\n")) {
    const t = linha.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [chave, ...resto] = t.split("=");
    const valor = resto.join("=").trim().replace(/^["']|["']$/g, "");
    if (chave && !process.env[chave.trim()]) process.env[chave.trim()] = valor;
  }
}

const pautas = Array.from({ length: 20 }, (_, i) => ({
  id: `x${i}`,
  titulo: i % 2 ? "Zema critica fim da taxação das blusinhas" : "Senado aprova fim da taxa de 20% em compras até US$ 50",
  descricao: "Texto aprovado pelas duas Casas segue para sanção presidencial, segundo a reportagem.",
  fonte: "Teste",
  url: "https://exemplo.com/a",
}));

const r = await classificarPautas(pautas);
console.log("classificadas:", r.classificacoes.size, "de", pautas.length);
console.log("falhas:", r.lotesComFalha);
for (const [id, c] of [...r.classificacoes].slice(0, 4)) {
  console.log(`${id}: natureza=${c.natureza} relevancia=${c.relevancia} pais=${c.pais}`);
}
