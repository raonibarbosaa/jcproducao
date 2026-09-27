// Configuração lida do ambiente, uma vez. Falta de variável essencial derruba
// o processo na subida, com o nome da variável — melhor do que subir e falhar
// em silêncio na primeira mensagem.
const env = (k, padrao = '') => (process.env[k] ?? padrao).toString().trim()

export const cfg = {
  porta: Number(env('PORT', '3000')),
  dominio: env('API_DOMAIN'),
  wa: {
    url: env('WA_URL', 'http://whatsapp:8080').replace(/\/+$/, ''),
    apiKey: env('WA_API_KEY'),
    instancia: env('WA_INSTANCIA', 'jc_principal'),
    webhookUrl: env('WA_WEBHOOK_URL', 'http://backend:3000/wa/webhook'),
    webhookToken: env('WA_WEBHOOK_TOKEN'),
    adminChave: env('WA_ADMIN_CHAVE'),
  },
  firebaseB64: env('FIREBASE_SERVICE_ACCOUNT_B64'),
  midia: {
    dir: env('MIDIA_DIR', '/dados/midia'),
    segredo: env('MIDIA_SEGREDO'),
  },
}

export function validaConfig() {
  const faltam = []
  if (!cfg.wa.apiKey) faltam.push('WA_API_KEY')
  if (!cfg.wa.webhookToken) faltam.push('WA_WEBHOOK_TOKEN')
  if (!cfg.firebaseB64) faltam.push('FIREBASE_SERVICE_ACCOUNT_B64')
  if (!cfg.midia.segredo) faltam.push('MIDIA_SEGREDO')
  if (faltam.length) {
    console.error(`[config] faltam variáveis: ${faltam.join(', ')} — ver backend/.env.example`)
    process.exit(1)
  }
}
