// ============================================================
// FIREBASE — config do projeto "ProducaoJcsacolas" (preenchida)
// ============================================================
// ⚠️ NÃO mexa nas restrições da API Key no Google Cloud Console.
//    Foi isso que causou o bug API_KEY_INVALID na versão anterior.
//    A chave default já funciona para Auth + Firestore.
// ============================================================

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

export const firebaseConfig = {
  apiKey: 'AIzaSyDNkD-ksLA-a3jLJeA7KuIYeiXCGMhaHFY',
  authDomain: 'producaojcsacolas.firebaseapp.com',
  projectId: 'producaojcsacolas',
  storageBucket: 'producaojcsacolas.firebasestorage.app',
  messagingSenderId: '729630740824',
  appId: '1:729630740824:web:d91be70c0dbc44cc5e152d',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// E-mails do Firebase (reset de senha, verificação) saem em português
auth.languageCode = 'pt'
// CACHE LOCAL (IndexedDB) — correção 3 da leitura de lentidão (07/10/2026).
// Sem ele, cada abertura do site baixava a coleção `pedidos` INTEIRA de novo
// (com os mapas de etapas/relógio de cada item) e cada troca de aba refazia a
// descarga de `entregues`, `cargas`, `planos`. Com o cache, o onSnapshot
// responde primeiro com o que está no aparelho e o servidor manda só o que
// mudou — é o tablet do posto e o celular do vendedor que mais sentem.
//   - `persistentMultipleTabManager`: o dono abre duas abas; sem isto a segunda
//     falhava em obter o IndexedDB e caía em memória, calada.
//   - Sem IndexedDB (navegação privada, cota cheia, WebView antiga) o SDK
//     avisa no console e cai sozinho no cache em memória — igual a antes.
//   - ⚠️ O que foi lido fica no APARELHO depois do logout (o Firestore não
//     limpa o IndexedDB ao sair). Limpar exigiria `terminate` +
//     `clearIndexedDbPersistence` + recarregar a página — e perderia o ganho
//     no login seguinte. Decisão registrada no CLAUDE.md.
//   - Tamanho padrão do cache: 40 MB, com coleta LRU do SDK.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
