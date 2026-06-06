import { createContext, useContext, useEffect, useState } from 'react'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase.js'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // { uid, email }
  const [perfil, setPerfil] = useState(null)    // 'designer' | 'financeiro' | 'dono'
  const [nome, setNome] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser({ uid: u.uid, email: u.email })
        // lê o perfil em usuarios/{uid}
        try {
          const snap = await getDoc(doc(db, 'usuarios', u.uid))
          if (snap.exists()) {
            const d = snap.data()
            setPerfil(d.perfil || 'dono')
            setNome(d.nome || u.email)
          } else {
            // sem documento de perfil -> trata como dono (fallback seguro p/ admin)
            setPerfil('dono')
            setNome(u.email)
          }
        } catch (e) {
          console.error('Erro ao ler perfil:', e)
          setPerfil('dono')
          setNome(u.email)
        }
      } else {
        setUser(null); setPerfil(null); setNome('')
      }
      setCarregando(false)
    })
    return unsub
  }, [])

  async function login(email, senha) {
    await signInWithEmailAndPassword(auth, email.trim(), senha)
  }
  async function logout() {
    await signOut(auth)
  }

  return (
    <AuthCtx.Provider value={{ user, perfil, nome, carregando, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}
