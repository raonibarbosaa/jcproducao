// AVISO AO CLIENTE PELO ESMERO — o texto que sai, o que vai no corpo e como a
// resposta vira o registro da tela. O que não pode: inventar motorista, mandar
// com a integração desligada, ou perder o motivo do erro.
import { textoAvisoSaida, montaAvisoSaida, registroWhatsSaida, resumoWhatsSaida, TEXTO_AVISO_SAIDA_PADRAO, STATUS_WHATS } from '../src/utils.js'
import { ok, t, resultado } from './_harness.mjs'

// ---------- texto ----------
t('modelo padrão com tudo',
  textoAvisoSaida(TEXTO_AVISO_SAIDA_PADRAO, { cliente: 'Atual', pedido: '5111', motorista: 'Juninho' }),
  'Olá, Atual! Aqui é da JC Sacolas. Seu pedido #5111 saiu para entrega com Juninho. Qualquer dúvida, é só responder esta mensagem.')
t('sem motorista a frase fecha limpa',
  textoAvisoSaida('Pedido {pedido} saiu{motorista}.', { pedido: 5111 }), 'Pedido #5111 saiu.')
t('sem cliente vira "cliente"', textoAvisoSaida('Olá, {cliente}!', {}), 'Olá, cliente!')
t('chave desconhecida fica visível', textoAvisoSaida('Oi {nome}', { cliente: 'X' }), 'Oi {nome}')
t('modelo vazio cai no padrão', textoAvisoSaida('', { cliente: 'A', pedido: 1 }).startsWith('Olá, A! Aqui é da JC Sacolas. Seu pedido #1'), true)

// ---------- corpo ----------
const clientes = [{ razao: 'ATUAL MODAS LTDA', nome: 'Atual', telefone: '(79) 99999-0000' }]
const p = { idVenda: '5111', cliente: 'ATUAL MODAS LTDA', cidade: 'ITABAIANA' }
const cfg = { url: 'https://esmero.exemplo.com.br/', ativo: true, textoSaida: '{cliente}: {pedido}{motorista} · {cidade}' }
const a = montaAvisoSaida(p, { motorista: 'Juninho', clientes, cfg })
t('url sem barra no fim', a.url, 'https://esmero.exemplo.com.br')
t('corpo com o pedido, o telefone do cadastro e o texto pelo modelo', a.corpo, {
  evento: 'saiu_para_entrega',
  pedido: { numero: '5111', cliente: 'ATUAL MODAS LTDA', cidade: 'ITABAIANA', motorista: 'Juninho', telefone: '(79) 99999-0000' },
  texto: 'Atual: #5111 com Juninho · ITABAIANA',
})
t('cliente sem telefone no JC manda null (o Esmero casa pela razão)',
  montaAvisoSaida(p, { motorista: 'J', clientes: [], cfg }).corpo.pedido.telefone, null)
t('integração desligada = nada', montaAvisoSaida(p, { motorista: 'J', clientes, cfg: { ...cfg, ativo: false } }), null)
t('sem URL = nada', montaAvisoSaida(p, { motorista: 'J', clientes, cfg: { ativo: true, url: ' ' } }), null)
t('sem pedido = nada', montaAvisoSaida(null, { clientes, cfg }), null)

// ---------- registro ----------
const quem = { executorNome: 'Anny', porNome: 'Tablet' }
const okr = registroWhatsSaida({ ok: true, mensagemId: 'm1', cliente: { nome: 'Atual', telefone: '(79) 99999-0000' }, numero: 'Loja centro' }, { quem, texto: 'oi', agora: '2026-10-07T20:00:00.000Z' })
t('enviado guarda quem, quando, cliente e número', okr, {
  status: 'enviado', em: '2026-10-07T20:00:00.000Z', por: 'Anny', texto: 'oi',
  cliente: 'Atual', telefone: '(79) 99999-0000', numero: 'Loja centro', mensagemId: 'm1',
})
const err = registroWhatsSaida({ ok: false, motivo: 'cliente_sem_telefone', detalhe: 'x' }, { quem, agora: '2026-10-07T20:00:00.000Z' })
t('erro traduz o motivo para a tela', err.status === STATUS_WHATS.ERRO && err.detalhe, 'cliente sem telefone no Esmero')
t('motivo desconhecido usa o detalhe do Esmero', registroWhatsSaida({ ok: false, motivo: 'outro', detalhe: 'caiu' }).detalhe, 'caiu')
t('falha de rede (sem resposta) vira erro legível', registroWhatsSaida(null).detalhe, 'não foi possível avisar')
t('chip enviado', resumoWhatsSaida(okr), 'WhatsApp enviado para Atual pelo Loja centro')
t('chip erro', resumoWhatsSaida(err), 'WhatsApp não enviado: cliente sem telefone no Esmero')
t('sem registro, sem chip', resumoWhatsSaida(undefined), '')
ok('status conhecidos', Object.values(STATUS_WHATS).length === 3)

export default resultado('aviso-esmero')
