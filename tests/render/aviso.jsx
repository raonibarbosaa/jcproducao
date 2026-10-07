// AVISO AO CLIENTE PELO ESMERO — o chip no bloco de ações do Controle/Localizar
// (enviado × não enviado com motivo × lançado antes da ponte) e a aba Integrações.
import { renderToString } from 'react-dom/server'
import AcoesControle from '../../src/components/AcoesControle.jsx'
import { AbaIntegracoes } from '../../src/pages/Cadastros.jsx'

const lancado = {
  idVenda: '6215', cliente: 'ATUAL MODAS LTDA', cidade: 'ITABAIANA',
  baixaEscritorio: { em: '2026-10-07T18:00:00.000Z', por: 'Anny', motorista: 'MATEUS' },
  saidaEm: '2026-10-07T18:00:00.000Z', saidaMotorista: 'MATEUS', saidaPor: 'Anny',
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 100, key: 'PA#1' }],
  etapas: { 'PA#1': { expedido: 100 } },
}
const acoes = { salvando: '', reenviarAviso() {}, lancar() {}, voltou() {}, sairDeNovo() {}, entregar() {} }
const ligado = { esmero: { url: 'https://esmero.exemplo.com.br', ativo: true, textoSaida: '' } }

function acao(p, cad) {
  globalThis.__auth = { perfil: 'dono', nome: 'Dono', user: { uid: 'd' } }
  globalThis.__cad = cad
  try {
    return renderToString(<AcoesControle p={p} motoristas={[{ nome: 'MATEUS' }]} podeLancar podeEntregar acoes={acoes} problemas={[]} />)
  } finally { globalThis.__cad = undefined; globalThis.__auth = undefined }
}

export function roda() {
  return {
    avisoOk: acao({ ...lancado, whatsSaida: { status: 'enviado', em: '2026-10-07T18:00:05.000Z', por: 'Anny', cliente: 'Atual', numero: 'Loja centro', texto: 'oi' } }, ligado),
    avisoErro: acao({ ...lancado, whatsSaida: { status: 'erro', em: '2026-10-07T18:00:05.000Z', por: 'Anny', motivo: 'cliente_sem_telefone', detalhe: 'cliente sem telefone no Esmero' } }, ligado),
    avisoNenhum: acao(lancado, ligado),
    avisoDesligado: acao(lancado, { esmero: { url: '', ativo: false, textoSaida: '' } }),
    integ: (() => {
      globalThis.__auth = { perfil: 'dono', nome: 'Dono', user: { uid: 'd' } }
      globalThis.__cad = ligado
      try { return renderToString(<AbaIntegracoes />) } finally { globalThis.__cad = undefined; globalThis.__auth = undefined }
    })(),
  }
}
