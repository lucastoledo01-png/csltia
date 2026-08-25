const url = "https://automacoes-listmonk.vdetve.easypanel.host";
const token = "GJb65m7291fz4CLs7yz4qyNNgUe5Tc2r";

const candidateKeys = [
  "admin",
  "root",
  "listmonk",
  "default",
  "api",
  "newsletter",
  "casaloti",
  "desbuguei",
  "lucas",
  "lucastoledo",
  "lucastoledo01",
];

async function testAuth() {
  console.log("=== TESTANDO SCHEMAS DE AUTENTICAÇÃO DO LISTMONK ===");

  for (const keyId of candidateKeys) {
    const basicVal = Buffer.from(`${keyId}:${token}`).toString("base64");
    const headersList = [
      { name: `token ${keyId}:${token}`, val: `token ${keyId}:${token}` },
      { name: `Basic ${keyId}:${token}`, val: `Basic ${basicVal}` },
    ];

    for (const h of headersList) {
      try {
        const res = await fetch(`${url}/api/campaigns`, {
          method: "GET",
          headers: { Authorization: h.val },
        });
        const text = await res.text().catch(() => "");
        if (res.ok) {
          console.log(`\n🎉 SUCESSO ABSOLUTO com header: "${h.name}"! Status: ${res.status}`);
          console.log(`Resposta:`, text.slice(0, 200));
          return;
        } else {
          console.log(`- ${h.name} -> HTTP ${res.status}: ${text.slice(0, 100)}`);
        }
      } catch (err: any) {
        console.log(`- ${h.name} -> Erro: ${err.message}`);
      }
    }
  }
}

testAuth();
