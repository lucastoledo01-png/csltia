import { enriquecerPauta, conteudoInsuficiente } from "../src/lib/server/editorial/enriquecimento";
async function main() {
  for (const u of process.argv.slice(2)) {
    try {
      const r = await enriquecerPauta({ titulo: "teste", descricao: "", url: u } as any);
      console.log(`\n--- ${u}\n  status=${r.enrichmentStatus} len=${r.contentLength} src=${r.contentSource}`);
      console.log(`  notas=${JSON.stringify(r.notas)}`);
      console.log(`  insuf=${JSON.stringify(conteudoInsuficiente(r.texto || ""))}`);
      console.log(`  trecho="${(r.texto || "").slice(0, 150).replace(/\s+/g, " ")}"`);
    } catch (e) { console.log(`\n--- ${u}\n  ERRO ${(e as Error).message}`); }
  }
}
main();
