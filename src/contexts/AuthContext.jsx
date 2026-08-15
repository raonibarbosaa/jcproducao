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
  const [perfil, setPerfil] = useState(null)   // 'designer' | 'financeiro' | 'dono' | 'vendedor' | 'operador' | 'expedicao'
  const [semPerfil, setSemPerfil] = useState(false)  // autenticado, mas NÃO cadastrado
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
            setSemPerfil(false)
            setNome(d.nome || u.email)
            setVendedorNome(d.vendedorNome || null)
            setSetores(Array.isArray(d.setores) ? d.setores : [])
            setMateriais(Array.isArray(d.materiais) ? d.materiais : [])
          } else {
            // ⚠️ SEM documento de perfil = SEM acesso. Antes isto virava 'dono'
            // com o comentário "fallback seguro p/ admin" — e era o contrário:
            // o cadastro público do Firebase está aberto, então qualquer pessoa
            // que criasse uma conta caía aqui e ganhava a INTERFACE DE DONO.
            // Falhar fechado é o certo: quem não foi cadastrado não entra.
            setPerfil(null)
            setSemPerfil(true)
            setNome(u.email)
            setVendedorNome(null)
            setSetores([]); setMateriais([])
          }
        } catch (e) {
          console.error('Erro ao ler perfil:', e)
          // erro de leitura também fecha: conceder dono por causa de uma falha
          // de rede é exatamente o caminho que um atacante procura
          setPerfil(null)
          setSemPerfil(true)
          setNome(u.email)
          setVendedorNome(null)
          setSetores([]); setMateriais([])
        }
      } else {
        setUser(null); setPerfil(null); setSemPerfil(false); setNome(''); setVendedorNome(null); setSetores([]); setMateriais([])
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
    <AuthCtx.Provider value={{ user, perfil, semPerfil, nome, vendedorNome, setores, materiais, carregando, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}
