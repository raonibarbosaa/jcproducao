// ============================================================
// FIREBASE — config do projeto "ProducaoJcsacolas" (preenchida)
// ============================================================
// ⚠️ NÃO mexa nas restrições da API Key no Google Cloud Console.
//    Foi isso que causou o bug API_KEY_INVALID na versão anterior.
//    A chave default já funciona para Auth + Firestore.
// ============================================================

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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
export const db = getFirestore(app)
