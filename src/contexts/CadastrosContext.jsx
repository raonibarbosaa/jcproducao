import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useAuth } from './AuthContext.jsx'
import { definirCores, doDoc, mesclaClientes } from '../utils.js'

const CadCtx = createContext(null)
export const useCadastros = () => useContext(CadCtx)

// Documento único: config/cadastros = { vendedores: [...], itens: [...], motoristas, logistica, cores }
// + a coleção `clientes` (um doc por cliente — correção 5, 07/10/2026). O array
// `clientes` que ficou no documento é lido como LEGADO e mesclado, perdendo
// para a coleção, até a migração (Cadastros › Clientes) apagar o campo.
export function CadastrosProvider({ children }) {
  const { user } = useAuth()
  const [vendedores, setVendedores] = useState([])
  const [clientesCol, setClientesCol] = useState([])       // coleção `clientes`
  const [clientesLegado, setClientesLegado] = useState([]) // ainda em config/cadastros
  const [itens, setItens] = useState([])
  const [motoristas, setMotoristas] = useState([])
  // parâmetros de logística (hoje só a capacidade do caminhão, em kg)
  const [logistica, setLogistica] = useState({})
  // cores da impressão (Cadastros › Cores); [] = as de fábrica
  const [cores, setCores] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // Só assina DEPOIS do login. As regras do Firestore exigem auth, e um
    // onSnapshot disparado antes da autenticação morre com permission-denied
    // e não se reconecta sozinho — era a causa do falso aviso "Nenhum vendedor
    // cadastrado" no carregamento a frio.
    if (!user) {
      setVendedores([])
      setClientesLegado([])
      setItens([])
      setMotoristas([])
      setLogistica({})
      setCarregando(false)
      return
    }
    setCarregando(true)
    const unsub = onSnapshot(doc(db, 'config', 'cadastros'), (snap) => {
      if (snap.exists()) {
        const d = snap.data()
        setVendedores(Array.isArray(d.vendedores) ? d.vendedores : [])
        setClientesLegado(Array.isArray(d.clientes) ? d.clientes : [])
        setItens(Array.isArray(d.itens) ? d.itens : [])
        setMotoristas(Array.isArray(d.motoristas) ? d.motoristas : [])
        setLogistica(d.logistica && typeof d.logistica === 'object' ? d.logistica : {})
        // o registro do utils vem ANTES do setState: quem renderizar já vê a lista nova
        definirCores(d.cores)
        setCores(Array.isArray(d.cores) ? d.cores : [])
      } else {
        setVendedores([])
        setClientesLegado([])
        setItens([])
        setMotoristas([])
        setLogistica({})
        definirCores([])
        setCores([])
      }
      setCarregando(false)
    }, (e) => {
      console.error('Erro ao ler cadastros:', e)
      setCarregando(false)
    })
    return unsub
  }, [user?.uid])

  // A coleção `clientes`. ⚠️ Se as rules ainda não foram publicadas a leitura
  // morre com permission-denied: o erro é registrado e a lista fica vazia, e a
  // tela continua funcionando com o array legado — publicar as rules ANTES do
  // build continua sendo a regra da casa, isto é só a rede de segurança.
  useEffect(() => {
    if (!user) { setClientesCol([]); return undefined }
    return onSnapshot(collection(db, 'clientes'),
      (snap) => setClientesCol(snap.docs.map(doDoc)),
      (e) => { console.error('Erro ao ler clientes:', e); setClientesCol([]) })
  }, [user?.uid])

  // UMA lista para todo mundo, sem repetir: a coleção ganha do legado
  const clientes = useMemo(() => mesclaClientes(clientesCol, clientesLegado), [clientesCol, clientesLegado])

  return (
    <CadCtx.Provider value={{ vendedores, clientes, clientesLegado, itens, motoristas, logistica, cores, carregando }}>
      {children}
    </CadCtx.Provider>
  )
}
