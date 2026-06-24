import { createContext, useContext, useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useAuth } from './AuthContext.jsx'

const CadCtx = createContext(null)
export const useCadastros = () => useContext(CadCtx)

// Documento único: config/cadastros = { vendedores: [...], clientes: [...], itens: [...] }
export function CadastrosProvider({ children }) {
  const { user } = useAuth()
  const [vendedores, setVendedores] = useState([])
  const [clientes, setClientes] = useState([])
  const [itens, setItens] = useState([])
  const [motoristas, setMotoristas] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // Só assina DEPOIS do login. As regras do Firestore exigem auth, e um
    // onSnapshot disparado antes da autenticação morre com permission-denied
    // e não se reconecta sozinho — era a causa do falso aviso "Nenhum vendedor
    // cadastrado" no carregamento a frio.
    if (!user) {
      setVendedores([])
      setClientes([])
      setItens([])
      setMotoristas([])
      setCarregando(false)
      return
    }
    setCarregando(true)
    const unsub = onSnapshot(doc(db, 'config', 'cadastros'), (snap) => {
      if (snap.exists()) {
        const d = snap.data()
        setVendedores(Array.isArray(d.vendedores) ? d.vendedores : [])
        setClientes(Array.isArray(d.clientes) ? d.clientes : [])
        setItens(Array.isArray(d.itens) ? d.itens : [])
        setMotoristas(Array.isArray(d.motoristas) ? d.motoristas : [])
      } else {
        setVendedores([])
        setClientes([])
        setItens([])
        setMotoristas([])
      }
      setCarregando(false)
    }, (e) => {
      console.error('Erro ao ler cadastros:', e)
      setCarregando(false)
    })
    return unsub
  }, [user?.uid])

  return (
    <CadCtx.Provider value={{ vendedores, clientes, itens, motoristas, carregando }}>
      {children}
    </CadCtx.Provider>
  )
}
