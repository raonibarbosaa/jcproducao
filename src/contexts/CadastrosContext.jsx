import { createContext, useContext, useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.js'

const CadCtx = createContext(null)
export const useCadastros = () => useContext(CadCtx)

// Documento único: config/cadastros = { vendedores: [...], clientes: [...] }
export function CadastrosProvider({ children }) {
  const [vendedores, setVendedores] = useState([])
  const [clientes, setClientes] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'cadastros'), (snap) => {
      if (snap.exists()) {
        const d = snap.data()
        setVendedores(Array.isArray(d.vendedores) ? d.vendedores : [])
        setClientes(Array.isArray(d.clientes) ? d.clientes : [])
      } else {
        setVendedores([])
        setClientes([])
      }
      setCarregando(false)
    }, () => setCarregando(false))
    return unsub
  }, [])

  return (
    <CadCtx.Provider value={{ vendedores, clientes, carregando }}>
      {children}
    </CadCtx.Provider>
  )
}
