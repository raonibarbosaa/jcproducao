import { useEffect, useState } from 'react'
import { versaoMudou } from '../utils.js'

// AVISO DE VERSÃO NOVA (08/10/2026). A aba aberta nunca recarrega sozinha, e
// uma aba com o build antigo continua rodando dias depois do deploy — quando a
// atualização muda ONDE o dado mora (o cadastro de clientes saiu do documento
// para uma coleção), o build antigo passa a ler o lugar errado e a tela
// "perde" dados que estão lá. O id do build vai no código (`__BUILD_ID__`,
// definido no vite.config.js) e em `version.json` ao lado do index; aqui os
// dois são comparados ao abrir, ao voltar para a aba e a cada 10 minutos.
// É AVISO, não recarga automática: recarregar no meio de uma triagem não
// salva jogaria o trabalho fora.
const ATUAL = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : ''
export const INTERVALO_VERSAO_MS = 10 * 60 * 1000

export async function buscaVersaoRemota() {
  try {
    const url = `${import.meta.env.BASE_URL || './'}version.json?_=${Date.now()}`
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) return ''
    const j = await r.json()
    return j?.build || ''
  } catch { return '' }
}

export default function AvisoVersao() {
  const [nova, setNova] = useState(false)

  useEffect(() => {
    if (!ATUAL || import.meta.env.DEV) return undefined
    let vivo = true
    const confere = async () => {
      const remota = await buscaVersaoRemota()
      if (vivo && versaoMudou(ATUAL, remota)) setNova(true)
    }
    const aoVoltar = () => { if (document.visibilityState === 'visible') confere() }
    confere()
    const timer = setInterval(confere, INTERVALO_VERSAO_MS)
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => {
      vivo = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [])

  if (!nova) return null
  return (
    <div className="aviso-versao" role="status">
      <span>🔄 Saiu uma <b>versão nova</b> do sistema. Salve o que estiver fazendo e recarregue.</span>
      <button className="btn" onClick={() => window.location.reload()}>Recarregar agora</button>
    </div>
  )
}
