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
  const [perfil, setPerfil] = useState(null)    // 'designer' | 'financeiro' | 'dono' | 'vendedor'
  const [nome, setNome] = useState('')
  const [vendedorNome, setVendedorNome] = useState(null) // vínculo p/ perfil 'vendedor'
  const [setores, setSetores] = useState([])   // setores liberados p/ perfil 'operador'
  const [materiais, setMateriais] = useState([]) // materiais liberados ([] = todos)
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
            if (d.ativo === false) {
              // acesso desativado pelo admin -> derruba a sessão
              await signOut(auth)
              alert('Seu acesso foi desativado. Fale com o administrador do sistema.')
              setCarregando(false)
              return
            }
            setPerfil(d.perfil || 'dono')
            setNome(d.nome || u.email)
            setVendedorNome(d.vendedorNome || null)
            setSetores(Array.isArray(d.setores) ? d.setores : [])
            setMateriais(Array.isArray(d.materiais) ? d.materiais : [])
          } else {
            // sem documento de perfil -> trata como dono (fallback seguro p/ admin)
            setPerfil('dono')
            setNome(u.email)
            setVendedorNome(null)
            setSetores([]); setMateriais([])
          }
        } catch (e) {
          console.error('Erro ao ler perfil:', e)
          setPerfil('dono')
          setNome(u.email)
          setVendedorNome(null)
          setSetores([]); setMateriais([])
        }
      } else {
        setUser(null); setPerfil(null); setNome(''); setVendedorNome(null); setSetores([]); setMateriais([])
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
    <AuthCtx.Provider value={{ user, perfil, nome, vendedorNome, setores, materiais, carregando, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}
