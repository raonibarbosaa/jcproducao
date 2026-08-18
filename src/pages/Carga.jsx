import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  STATUS_CARGA, itensParaCarga, proximoNumeroCarga, cargaAberta, progressoConferencia,
  cargaConferida, agrupaCargaPorPedido, pedidosDaCarga, arredondaQtd, chaveCarga,
  CARGA_SEGURA_ITENS,
  nomeCliente, fmtData, fmtDataHora, fmtQtd, situacaoPrazo, ordemRota,
  materialDoItem, MATERIAIS, totaisPorMaterial, fmtTotais, filtraPedidos, previsaoDe,
  vendedoresDe, resumoFiltros,
  temVolumes, volumesNaEtapa, mapaEtapasMovendoVolumes, mapaEtapasComQtd, qtdNaEtapa,
  pesoDaLista, fmtPeso, temTrabalhoNaProducao,
  STATUS_PLANO, proximoNumeroPlano, planosAbertos, planosFechados, pedidosEmPlanos, situacaoNoPlano,
  nomeStatusPlano, fechamentoDoPlano, rotuloCarga, agrupaRomaneioPorRota,
  rotasDoVendedor, pendenciasDoPedido, pendenciasPorEtapa, MODO_ORDER,
  itensPendentesDoPedido, resumePendencias,
  doPlano, planoPorData, rotuloPlano, agrupaPlanoPorRota, diaDaPrevisao, entregaAte,
  keyDoItem, linhaDoItem, qtdEmProducao, etapaDoItem, nomeEtapaItem,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import SeloLinha from '../components/SeloLinha.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'

// CONTROLE DE ENTREGAS — a carga é a VIAGEM do caminhão.
// A tela de Rota mostra o que está pronto agora (uma foto do momento). Aqui o
// operador da expedição monta o que vai NESTE caminhão: escolhe pedido a pedido,
// podendo misturar rotas e deixar para trás o que não coube, confere item a item
// ao carregar e marca a saída. O romaneio passa a ser o papel dessa carga.
//
// A expedição monta, confere e marca a saída — mas NÃO dá a entrega: é ela que
// abre a cobrança, e segue com dono/designer/financeiro na tela de Rota.
export default function Carga({ pedidos }) {
  const { clientes, motoristas, itens: itensCad, vendedores: cadastros, logistica } = useCadastros()
  const { nome, perfil } = useAuth()
  const podeDesfazer = perfil === 'dono'   // desfazer uma viagem que já saiu
  const [cargas, setCargas] = useState([])
  const [motorista, setMotorista] = useState('')
  const [salvando, setSalvando] = useState('')
  const [planos, setPlanos] = useState([])
  const [planoId, setPlanoId] = useState('')    // plano sendo montado na tela
  const [aba, setAba] = useState('planos')      // 'planos' | 'montar' | 'historico'
  const [filtros, setFiltros] = useState({})           // dentro do plano
  const [filtrosLista, setFiltrosLista] = useState({}) // lista de previsões
  const motoristasAtivos = motoristas.filter((m) => m.ativo !== false)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cargas'),
      (snap) => setCargas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler cargas:', e))
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'planos'),
      (snap) => setPlanos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler planos:', e))
    return unsub
  }, [])

  const aberta = cargaAberta(cargas)

  // Quanto de cada item já está comprometido com alguma carga viva (montando ou
  // que já saiu). Sem isso o mesmo pedido entraria em duas cargas — e o caso não
  // é raro: expediram 40, foram numa carga, depois expediram os outros 60.
  // Volume já numa carga viva não pode entrar noutra. Para o legado sem volume,
  // a conta continua sendo por quantidade (expediram 40, depois mais 60).
  const volsUsados = new Set()
  const comprometido = new Map()
  for (const c of cargas) {
    if (!CARGA_SEGURA_ITENS(c.status)) continue
    for (const it of c.itens || []) {
      if (it.volumeId) { volsUsados.add(chaveCarga(it)); continue }
      const k = chaveCarga(it)
      comprometido.set(k, arredondaQtd((comprometido.get(k) || 0) + (Number(it.qtd) || 0)))
    }
  }

  // pedidos com quantidade expedida ainda LIVRE para entrar numa carga.
  // A lista NÃO é filtrada: é a base da seleção. Assim dá para filtrar a ROTA 01,
  // marcar, trocar para a ROTA 02 e marcar mais — sem perder o que já foi escolhido.
  const disponiveis = []
  for (const p of (pedidos || []).map((x) => ({ ...x, previsao: previsaoDe(x, cadastros) }))) {
    const livres = itensParaCarga(p)
      .filter((it) => !it.volumeId || !volsUsados.has(chaveCarga(it)))
      .map((it) => ({
        ...it,
        material: materialDoItem({ produto: it.produto }, itensCad),
        qtd: it.volumeId
          ? it.qtd
          : arredondaQtd(it.qtd - (comprometido.get(chaveCarga(it)) || 0)),
      }))
      .filter((it) => it.qtd > 0)
    if (livres.length) disponiveis.push({ p, itens: livres })
  }

  const capacidadeKg = Number(logistica?.capacidadeKg) > 0 ? Number(logistica.capacidadeKg) : 0
  const livresPorPedido = new Map(disponiveis.map((d) => [String(d.p.idVenda), d.itens]))
  const todos = (pedidos || []).map((x) => ({ ...x, previsao: previsaoDe(x, cadastros) }))

  // ---------- planos ----------
  const abertos = planosAbertos(planos)
  const plano = planos.find((x) => x.id === planoId) || null
  // um pedido só pode estar num plano aberto por vez: duas viagens contando com
  // a mesma mercadoria é o erro que some sozinho na hora de carregar
  const noutroPlano = pedidosEmPlanos(planos, planoId)
  const emAlgumPlano = pedidosEmPlanos(planos)

  // PRONTOS SEM PREVISÃO — o que está expedido e não entrou em plano nenhum.
  // Sem esta lista o estoque pronto fica INVISÍVEL: ao trocar a montagem direta
  // pelo plano, tudo que já estava pronto sumiu da tela de uma vez. É também o
  // ponto de partida natural — a previsão nasce do que já existe no galpão.
  const prontosLivres = disponiveis.filter((d) => !emAlgumPlano.has(String(d.p.idVenda)))
  const idsListaFiltrada = new Set(
    filtraPedidos(prontosLivres.map((d) => d.p), filtrosLista, clientes).map((p) => p.idVenda))
  // Agrupado pela DATA de entrega, que é a unidade da viagem: o dia é que enche
  // o caminhão, e por vendedor+rota o mesmo dia aparecia repartido em vários
  // cards sem ninguém ver o tamanho da saída.
  const gruposProntos = Object.values(
    prontosLivres
      .filter((d) => idsListaFiltrada.has(d.p.idVenda))
      .reduce((acc, d) => {
        const k = diaDaPrevisao(d.p) || 'sem-data'
        ;(acc[k] ??= { chave: k, dia: diaDaPrevisao(d.p), pedidos: [], volumes: [] })
        acc[k].pedidos.push(d.p)
        acc[k].volumes.push(...d.itens)
        return acc
      }, {})
  ).map((g) => ({
    ...g,
    peso: pesoDaLista(g.volumes, itensCad),
    // as rotas de dentro do dia continuam à vista: é o que diz se o dia é uma
    // viagem só ou três
    rotas: agrupaPlanoPorRota(g.pedidos, cadastros),
  })).sort((a, b) => String(a.dia || '9999').localeCompare(String(b.dia || '9999')))
  const prontosSemPlano = gruposProntos.reduce((n, g) => n + g.pedidos.length, 0)
  // já existe previsão aberta para este dia? então é melhor engordar aquela
  const planoDaData = (dia) => abertos.find((pl) => pl.dataEntrega && pl.dataEntrega === dia)

  // Rotas do seletor: com um vendedor escolhido, TODAS as cadastradas dele (mais
  // as que aparecem em pedido). Sem isso a rota só existia no filtro depois de
  // alguém expedir algo dela. Sem vendedor escolhido, a barra calcula sozinha.
  const rotasFiltro = filtrosLista.vendedor
    ? [...new Set([
        ...rotasDoVendedor(filtrosLista.vendedor, cadastros),
        ...todos.filter((p) => (p.vendedor || '—') === filtrosLista.vendedor)
          .map((p) => p.rota || 'SEM ROTA'),
      ])].filter(Boolean)
        .sort((a, b) => (ordemRota(filtrosLista.vendedor, a, cadastros)
          - ordemRota(filtrosLista.vendedor, b, cadastros)) || a.localeCompare(b))
    : undefined

  // Candidatos do plano: TODO pedido do bolo natural da previsão (entrega até a
  // data dela; nas antigas, o vendedor+rota) que ainda tem serviço na fábrica OU
  // já tem volume livre. É o ponto do planejamento — enxergar o que está vindo,
  // não só o que já está pronto. Quem decide o "bolo natural" é `doPlano`.
  const candidatos = plano
    ? todos.filter((p) => doPlano(p, plano)
        && (livresPorPedido.has(String(p.idVenda)) || temTrabalhoNaProducao(p)))
    : []
  const noPlano = new Set((plano?.pedidos || []).map(String))
  const idsFiltrados = new Set(filtraPedidos(candidatos, filtros, clientes).map((p) => p.idVenda))
  // a busca em outras rotas roda sobre TODOS os pedidos, não sobre os candidatos
  const idsBusca = new Set(filtraPedidos(todos, filtros, clientes).map((p) => p.idVenda))

  // O que está NA previsão sai de `todos`, não dos candidatos: a rota é viva
  // (recalculada pelo cadastro de cidades), então um pedido cuja cidade mudou de
  // rota deixaria de casar com a do plano e sumiria da tela — continuando dentro
  // de `plano.pedidos`, invisível. Quem entrou na viagem fica visível até alguém
  // tirar.
  const dentro = plano ? todos.filter((p) => noPlano.has(String(p.idVenda))) : []
  const fora = candidatos
    .filter((p) => !noPlano.has(String(p.idVenda)) && idsFiltrados.has(p.idVenda))
    .sort((a, b) => (a.previsao || '').localeCompare(b.previsao || ''))

  // BUSCA EM OUTRAS ROTAS — a exceção que o caminhão faz: passa perto, então
  // pega. Fica FORA da lista normal de propósito: entrar aqui é decisão, não
  // rotina, e a fila natural da rota não pode ficar poluída com o sistema todo.
  //
  // A lista aparece SEMPRE, mesmo sem filtro. Antes ela exigia um filtro ativo, e
  // escolher "Todos vendedores" — que é a ausência de filtro — devolvia tela
  // vazia: o operador seleciona "todos" justamente para ver todos. O tamanho é
  // resolvido com CORTE VISÍVEL (o rodapé diz quantos ficaram de fora), não
  // escondendo tudo.
  const deOutrasRotas = plano
    ? todos
        .filter((p) => !noPlano.has(String(p.idVenda))
          && !doPlano(p, plano)
          && idsBusca.has(p.idVenda)
          && (livresPorPedido.has(String(p.idVenda)) || temTrabalhoNaProducao(p)))
        .sort((a, b) => (a.previsao || '').localeCompare(b.previsao || ''))
    : []

  // o que sai AGORA se liberar: só os volumes prontos dos pedidos do plano
  const volumesDoPlano = dentro.flatMap((p) => livresPorPedido.get(String(p.idVenda)) || [])
  const prontosDoPlano = dentro.filter((p) => livresPorPedido.has(String(p.idVenda)))
  const pesoPlano = pesoDaLista(volumesDoPlano, itensCad)
  const totaisPlano = totaisPorMaterial(
    volumesDoPlano.map((i) => ({ produto: i.produto, qtd: i.qtd })), itensCad)

  // resumo de um plano na LISTA (sem abrir): quantos já dá para levar
  const porIdTodos = new Map(todos.map((p) => [String(p.idVenda), p]))
  const resumoPlano = (pl) => {
    const ids = (pl.pedidos || []).map(String)
    const vols = ids.flatMap((id) => livresPorPedido.get(id) || [])
    return {
      total: ids.length,
      prontos: ids.filter((id) => livresPorPedido.has(id)).length,
      volumes: vols.length,
      peso: pesoDaLista(vols, itensCad),
      // a viagem deixou de ser só daquela rota — o card precisa dizer
      deFora: ids.filter((id) => {
        const p = porIdTodos.get(id)
        return p && !doPlano(p, pl)
      }).length,
      // que rotas/vendedores esta viagem virou — a previsão do dia atravessa
      // vendedor, e o card precisa dizer para onde o caminhão vai
      rotas: agrupaPlanoPorRota(ids.map((id) => porIdTodos.get(id)).filter(Boolean), cadastros),
    }
  }

  // A previsão por data não tem vendedor nem rota próprios: o filtro passa a
  // olhar o que está DENTRO dela. Sem isso, escolher um vendedor na barra
  // escondia todas as previsões novas de uma vez.
  function casaPlanoFiltro(pl) {
    const { vendedor, rota } = filtrosLista
    if (!vendedor && !rota) return true
    if ((!vendedor || (pl.vendedor || '—') === vendedor)
      && (!rota || (pl.rota || 'SEM ROTA') === rota)) return true
    return (pl.pedidos || []).some((id) => {
      const p = porIdTodos.get(String(id))
      return p && (!vendedor || (p.vendedor || '—') === vendedor)
        && (!rota || (p.rota || 'SEM ROTA') === rota)
    })
  }

  async function criarPlano({ dataEntrega, vendedor, rota, saidaPrevista, pedidos: ids }) {
    setSalvando('plano')
    try {
      const ref = doc(collection(db, 'planos'))
      await setDoc(ref, {
        numero: proximoNumeroPlano(planos),
        status: STATUS_PLANO.ABERTO,
        // a previsão nova anda por DATA; vendedor/rota ficam vazios e existem só
        // para as previsões antigas continuarem legíveis
        dataEntrega: dataEntrega || '',
        vendedor: vendedor || '', rota: rota || '', saidaPrevista: saidaPrevista || '',
        pedidos: (ids || []).map(String), cargas: [],
        criadoEm: new Date().toISOString(), criadoPor: nome || '',
      })
      setPlanoId(ref.id)
    } catch (e) {
      alert('Não foi possível criar o plano: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // põe/tira um pedido da previsão — é o "acrescentar ou retirar" da viagem
  async function alternaNoPlano(p) {
    if (!plano || salvando) return
    const dentroAgora = noPlano.has(String(p.idVenda))
    const outro = noutroPlano.get(String(p.idVenda))
    if (!dentroAgora && outro) {
      alert(`O pedido #${p.idVenda} já está no plano #${outro.numero}. Tire de lá primeiro.`)
      return
    }
    // trazer pedido de fora é EXCEÇÃO: a viagem deixa de ser o que o título dela
    // diz, e ninguém pode descobrir isso na hora de carregar. Na previsão por
    // DATA, "de fora" é o pedido de outro dia — antecipar entrega é decisão.
    if (!dentroAgora && !doPlano(p, plano)) {
      const outroVend = (p.vendedor || '') !== (plano.vendedor || '')
      const ok = confirm(planoPorData(plano)
        ? `O pedido #${p.idVenda} tem entrega em ${fmtData(p.previsao)}, `
          + `depois desta viagem (até ${fmtData(plano.dataEntrega + 'T00:00:00')}).\n\n`
          + `${p.cliente || ''} · ${p.rota || 'SEM ROTA'} (${p.cidade || 'sem cidade'})\n\n`
          + `Antecipar e levar nesta viagem?`
        : outroVend
          ? `⚠ O pedido #${p.idVenda} é de OUTRO VENDEDOR.\n\n`
            + `Ele é de ${p.vendedor || '—'} · ${p.rota || 'SEM ROTA'} (${p.cidade || 'sem cidade'})\n`
            + `e vai entrar na viagem de ${plano.vendedor || '—'} · ${plano.rota}.\n\nConfirmar?`
          : `O pedido #${p.idVenda} é da ${p.rota || 'SEM ROTA'} (${p.cidade || 'sem cidade'}), `
            + `não da ${plano.rota}.\n\nO caminhão vai precisar passar lá. Confirmar?`)
      if (!ok) return
    }
    const ids = (plano.pedidos || []).map(String)
    await updateDoc(doc(db, 'planos', plano.id), {
      pedidos: dentroAgora ? ids.filter((x) => x !== String(p.idVenda)) : [...ids, String(p.idVenda)],
    })
  }

  async function alternaTodos(ligar, lista) {
    if (!plano || salvando) return
    const ids = new Set((plano.pedidos || []).map(String))
    // usa a lista VISÍVEL: com um filtro de situação ligado, "pôr todos" que
    // acrescentasse os escondidos seria uma ação maior do que a tela mostra
    for (const p of (lista || (ligar ? fora : dentro))) {
      if (ligar && noutroPlano.has(String(p.idVenda))) continue
      ligar ? ids.add(String(p.idVenda)) : ids.delete(String(p.idVenda))
    }
    await updateDoc(doc(db, 'planos', plano.id), { pedidos: [...ids] })
  }

  // joga um grupo de prontos dentro de uma previsão que já existe
  async function juntarNoPlano(pl, g) {
    const ids = new Set((pl.pedidos || []).map(String))
    for (const p of g.pedidos) ids.add(String(p.idVenda))
    await updateDoc(doc(db, 'planos', pl.id), { pedidos: [...ids] })
    setPlanoId(pl.id)
  }

  // Encerrar na mão: continua existindo para quando SOBRA pedido e mesmo assim
  // se quer fechar. Quem soltou tudo é encerrado sozinho pelo `liberarPlano`.
  async function encerrarPlano() {
    if (!plano) return
    if (!confirm(`Encerrar a previsão #${plano.numero} (${rotuloPlano(plano)})?\n\n` +
      `Ela sai da lista de abertas e vai para o histórico. Os pedidos que sobraram voltam a ficar livres.`)) return
    try {
      await updateDoc(doc(db, 'planos', plano.id), {
        status: (plano.cargas || []).length ? STATUS_PLANO.CONCRETIZADA : STATUS_PLANO.ENCERRADA,
        encerradaEm: new Date().toISOString(), encerradaPor: nome || '',
      })
      setPlanoId('')
    } catch (e) {
      alert('Não foi possível encerrar: ' + (e.code || e.message))
    }
  }

  // EXCLUIR NÃO APAGA. O documento fica com status `excluida`, e é isso que
  // impede o número de voltar a ser usado: `proximoNumeroPlano` é maior+1 sobre
  // o que existe, então apagar a #15 fazia a próxima nascer #15 de novo.
  // Os pedidos voltam a ficar livres sozinhos — a reserva (`pedidosEmPlanos`) só
  // olha previsão ABERTA, e esta deixou de ser.
  async function excluirPlano(pl) {
    const n = (pl.pedidos || []).length
    const viagens = (pl.cargas || []).length
    if (!confirm(
      `Excluir a previsão #${pl.numero}?\n\n`
      + (n ? `${n} pedido(s) voltam a ficar livres para entrar em outra viagem.\n` : '')
      + (viagens ? `As ${viagens} viagem(ns) que ela já gerou NÃO são desfeitas.\n` : '')
      + `O número ${pl.numero} fica registrado no histórico como excluído.`)) return
    setSalvando(`del:${pl.id}`)
    try {
      await updateDoc(doc(db, 'planos', pl.id), {
        status: STATUS_PLANO.EXCLUIDA,
        excluidaEm: new Date().toISOString(), excluidaPor: nome || '',
      })
      if (planoId === pl.id) setPlanoId('')
    } catch (e) {
      alert('Não foi possível excluir a previsão: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // Devolve o pedido de "expedido" para a EXPEDIÇÃO: ele volta a aparecer na
  // coluna do quadro, de onde o ← desembala para a montagem.
  // Faltava esse caminho: assim que o item é expedido ele some do quadro, e não
  // havia mais nenhum botão capaz de trazê-lo de volta.
  async function devolverParaExpedicao(d) {
    const p = d.p
    if (salvando) return
    if (!confirm(
      `Devolver o pedido #${p.idVenda} para a Expedição?\n\n` +
      `Ele volta a aparecer no quadro, na coluna Expedição. De lá o ← devolve para a montagem.`)) return
    setSalvando(`devolver|${p.idVenda}`)
    try {
      const porVolume = []
      const porQtd = []
      ;(p.itens || []).forEach((_, i) => {
        if (temVolumes(p, i)) {
          const ids = volumesNaEtapa(p, i, 'expedido')
          if (ids.length) porVolume.push({ idx: i, ids, para: 'expedicao' })
        } else {
          const q = qtdNaEtapa(p, i, 'expedido')
          if (q > 0) porQtd.push({ idx: i, de: 'expedido', para: 'expedicao', qtd: q })
        }
      })
      if (!porVolume.length && !porQtd.length) return
      const etapas = porVolume.length
        ? mapaEtapasMovendoVolumes(p, porVolume, nome)
        : mapaEtapasComQtd(p, porQtd, nome)
      await updateDoc(doc(db, 'pedidos', p.idVenda), { etapas })
    } catch (e) {
      alert('Não foi possível devolver: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // LIBERAR PARA ENTREGA: o plano solta o que está PRONTO e continua aberto com o
  // resto. Uma rota rende várias viagens — encerrar aqui obrigaria a refazer o
  // planejamento a cada carga, e o que ficou para trás sumiria de vista.
  async function liberarPlano() {
    if (!plano || !prontosDoPlano.length || salvando) return
    if (motoristasAtivos.length > 0 && !motorista) {
      alert('Escolha o motorista da carga.')
      return
    }
    const ficam = dentro.length - prontosDoPlano.length
    if (!confirm(
      `Liberar ${prontosDoPlano.length} pedido(s) · ${volumesDoPlano.length} volume(s) para entrega?\n\n` +
      (ficam ? `${ficam} pedido(s) continuam no plano, esperando ficar prontos.` : 'O plano fica sem pendências.'))) return
    setSalvando('liberar')
    try {
      const ref = doc(collection(db, 'cargas'))
      // A viagem HERDA o número da previsão: um número só do planejamento até o
      // caminhão. Uma previsão que libera duas vezes vira #15 e #15-2 (`viagem`
      // é a ordem da liberação). `numero` continua sendo gravado para o histórico
      // das cargas antigas, que nasceram antes de existir previsão.
      const viagem = (plano.cargas || []).length + 1
      await setDoc(ref, {
        numero: proximoNumeroCarga(cargas),
        status: STATUS_CARGA.MONTANDO,
        motorista: motorista || '',
        itens: volumesDoPlano,
        pedidos: prontosDoPlano.map((p) => p.idVenda),
        rotas: [...new Set(prontosDoPlano.map((p) => p.rota || 'SEM ROTA'))],
        planoId: plano.id, planoNumero: plano.numero || 0, viagem,
        dataEntrega: plano.dataEntrega || '',
        criadaEm: new Date().toISOString(),
        criadaPor: nome || '',
      })
      // os liberados saem da previsão: o que eles tinham de pronto virou carga
      const restam = (plano.pedidos || []).map(String)
        .filter((id) => !prontosDoPlano.some((p) => String(p.idVenda) === id))
      const agora = new Date().toISOString()
      await updateDoc(doc(db, 'planos', plano.id), {
        pedidos: restam,
        cargas: [...(plano.cargas || []), ref.id],
        liberadoEm: agora, liberadoPor: nome || '',
        // soltou tudo: a previsão cumpriu o papel e sai da lista sozinha. Aberta
        // com zero pedido ela só ocupava a tela — e escondia as que têm serviço.
        ...(restam.length ? {} : {
          status: STATUS_PLANO.CONCRETIZADA,
          concretizadaEm: agora, concretizadaPor: nome || '',
        }),
      })
      if (!restam.length) setPlanoId('')
      setMotorista(''); setAba('montar')
    } catch (e) {
      alert('Não foi possível liberar: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // conferência: marca o item como carregado
  async function conferir(carga, n, valor) {
    const itens = (carga.itens || []).map((it, i) => (i === n ? { ...it, conferido: valor } : it))
    await updateDoc(doc(db, 'cargas', carga.id), { itens })
  }
  async function conferirTudo(carga, valor) {
    await updateDoc(doc(db, 'cargas', carga.id), {
      itens: (carga.itens || []).map((it) => ({ ...it, conferido: valor })),
    })
  }

  // saída: fecha a carga e carimba a saída em cada pedido (é o que o vendedor vê)
  async function marcarSaida(carga) {
    const { total, conferidos } = progressoConferencia(carga)
    if (conferidos < total && !confirm(
      `Faltam ${total - conferidos} item(ns) para conferir. Marcar a saída assim mesmo?`)) return
    if (!confirm(`Confirmar a saída da carga #${carga.numero}${carga.motorista ? ` com ${carga.motorista}` : ''}?`)) return
    setSalvando('saida')
    try {
      const agora = new Date().toISOString()
      const ids = [...new Set(carga.pedidos || [])]
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db)
        for (const id of ids.slice(i, i + 400)) {
          batch.update(doc(db, 'pedidos', id), {
            saidaEm: agora, saidaMotorista: carga.motorista || '', saidaPor: nome || '',
          })
        }
        await batch.commit()
      }
      await updateDoc(doc(db, 'cargas', carga.id), {
        status: STATUS_CARGA.SAIU, saiuEm: agora, saiuPor: nome || '',
      })
    } catch (e) {
      alert('Não foi possível marcar a saída: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // Desfaz uma carga que JÁ SAIU: os pedidos voltam para a expedição (perdem a
  // marca de saída) e os itens ficam livres para outra viagem. A carga continua
  // no histórico como cancelada — apagar esconderia que a viagem foi registrada.
  async function retornarParaExpedicao(carga) {
    if (!podeDesfazer || salvando) return
    const ids = [...new Set(carga.pedidos || [])]
      .filter((id) => (pedidos || []).some((p) => String(p.idVenda) === String(id)))
    if (!confirm(
      `Retornar a carga #${carga.numero} para a expedição?\n\n` +
      `${ids.length} pedido(s) perdem a marca de saída e voltam a ficar disponíveis ` +
      `para carregar. Os que já foram entregues não são afetados.`)) return
    setSalvando('retornar')
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db)
        for (const id of ids.slice(i, i + 400)) {
          batch.update(doc(db, 'pedidos', id), {
            saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
          })
        }
        await batch.commit()
      }
      await updateDoc(doc(db, 'cargas', carga.id), {
        status: STATUS_CARGA.CANCELADA,
        canceladaEm: new Date().toISOString(),
        canceladaPor: nome || '',
      })
    } catch (e) {
      alert('Não foi possível retornar a carga: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // Tira UM pedido da carga em montagem: ele volta para a lista de disponíveis.
  // Faltava isso — só existia "cancelar carga", que é tudo ou nada, e na prática
  // o que acontece é um pedido não caber ou o cliente pedir para adiar.
  async function tirarDaCarga(carga, idVenda) {
    if (salvando) return
    const itens = (carga.itens || []).filter((it) => String(it.idVenda) !== String(idVenda))
    if (!confirm(`Tirar o pedido #${idVenda} desta carga? Ele volta a ficar disponível para carregar.`)) return
    setSalvando('tirar')
    try {
      if (!itens.length) {
        // sem item nenhum a carga não tem razão de existir
        await deleteDoc(doc(db, 'cargas', carga.id))
      } else {
        await updateDoc(doc(db, 'cargas', carga.id), {
          itens,
          pedidos: [...new Set(itens.map((it) => it.idVenda))],
          rotas: carga.rotas || [],
        })
      }
    } catch (e) {
      alert('Não foi possível tirar da carga: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  async function cancelarCarga(carga) {
    if (!confirm(`Cancelar a carga #${carga.numero}? Os pedidos voltam a ficar disponíveis para outra carga.`)) return
    await deleteDoc(doc(db, 'cargas', carga.id))
  }

  const historico = cargas
    .filter((c) => c.status !== STATUS_CARGA.MONTANDO)
    .sort((a, b) => (b.criadaEm || '').localeCompare(a.criadaEm || ''))
  // previsões que saíram de cena: viraram viagem, foram encerradas ou excluídas.
  // Antes o documento era apagado e não sobrava rastro de nenhuma das três.
  const planosFeitos = planosFechados(planos)
    .sort((a, b) => (Number(b.numero) || 0) - (Number(a.numero) || 0))

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">Controle de entregas
          <small>
            {aberta
              ? `carga #${aberta.numero} em montagem`
              : `${abertos.length} plano(s) · ${disponiveis.length} pedido(s) prontos`}
          </small>
        </h1>
        <CapacidadeCaminhao valor={capacidadeKg}
          podeEditar={['dono', 'designer', 'financeiro'].includes(perfil)} />
        <div className="spacer" />
        <div className="vista-toggle">
          <button className={`btn${aba === 'planos' ? ' primary' : ''}`} onClick={() => setAba('planos')}>
            📋 Planejamento {abertos.length > 0 && `(${abertos.length})`}
          </button>
          <button className={`btn${aba === 'montar' ? ' primary' : ''}`} onClick={() => setAba('montar')}>
            📦 Carga atual
          </button>
          <button className={`btn${aba === 'historico' ? ' primary' : ''}`} onClick={() => setAba('historico')}>
            ☰ Histórico {historico.length + planosFeitos.length > 0
              && `(${historico.length + planosFeitos.length})`}
          </button>
        </div>
      </div>

      {aba === 'planos' && (plano
        ? <>
            <PlanoAberto
              plano={plano} dentro={dentro} fora={fora} todos={todos}
              deOutrasRotas={deOutrasRotas}
              livresPorPedido={livresPorPedido} noutroPlano={noutroPlano}
              itensCad={itensCad} clientes={clientes} cadastros={cadastros}
              totais={totaisPlano} peso={pesoPlano} capacidadeKg={capacidadeKg}
              prontos={prontosDoPlano.length} volumes={volumesDoPlano.length}
              motorista={motorista} setMotorista={setMotorista} motoristas={motoristasAtivos}
              salvando={salvando} temCargaAberta={!!aberta}
              filtros={filtros} setFiltros={setFiltros}
              onVoltar={() => setPlanoId('')} onAlterna={alternaNoPlano}
              onAlternaTodos={alternaTodos} onLiberar={liberarPlano}
              onEncerrar={encerrarPlano} onDevolver={devolverParaExpedicao} />
          </>
        : <ListaPlanos planos={abertos.filter(casaPlanoFiltro)}
            resumo={resumoPlano} todos={todos} cadastros={cadastros}
            salvando={salvando} onAbrir={setPlanoId} onCriar={criarPlano} onExcluir={excluirPlano}
            gruposProntos={gruposProntos} prontosSemPlano={prontosSemPlano}
            planoDaData={planoDaData} onJuntar={juntarNoPlano} clientes={clientes}
            livresPorPedido={livresPorPedido}
            filtros={filtrosLista} setFiltros={setFiltrosLista}
            baseFiltro={prontosLivres.map((d) => d.p)} totalPlanos={abertos.length}
            baseSeletores={todos} rotasFiltro={rotasFiltro} />)}

      {aba === 'montar' && (aberta
        ? <Conferencia carga={aberta} pedidos={pedidos} clientes={clientes} itensCad={itensCad}
            cadastros={cadastros}
            salvando={salvando} onConferir={conferir} onConferirTudo={conferirTudo}
            onSaida={marcarSaida} onCancelar={cancelarCarga} onTirar={tirarDaCarga} />
        : <div className="empty"><div className="big">📦</div>
            Nenhuma carga em montagem. A carga nasce de um plano — vá em
            <b> 📋 Planejamento</b>, monte a previsão da viagem e clique em
            <b> 🚚 Liberar para entrega</b>.
          </div>)}

      {aba === 'historico' && (
        <Historico cargas={historico} planos={planosFeitos} podeDesfazer={podeDesfazer}
          salvando={salvando} onRetornar={retornarParaExpedicao} />
      )}
    </>
  )
}

// Capacidade do caminhão, em kg — o limite que a sugestão usa para avisar.
// Fica no cadastro (`config/cadastros.logistica`) e só staff altera: é um número
// que orienta todo mundo, e mudá-lo sem querer faria a tela mentir para a equipe.
function CapacidadeCaminhao({ valor, podeEditar }) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const n = Number(String(txt).replace(',', '.'))
    setSalvando(true)
    try {
      await updateDoc(doc(db, 'config', 'cadastros'), {
        'logistica.capacidadeKg': txt === '' || !(n > 0) ? deleteField() : n,
      })
      setEditando(false)
    } catch (e) {
      alert('Não foi possível salvar: ' + (e.code || e.message))
    } finally { setSalvando(false) }
  }

  if (!editando) {
    return (
      <span className="chip" style={{ cursor: podeEditar ? 'pointer' : 'default' }}
        title={podeEditar ? 'Clique para alterar a capacidade do caminhão' : ''}
        onClick={() => { if (podeEditar) { setTxt(valor ? String(valor) : ''); setEditando(true) } }}>
        🚛 {valor > 0 ? `${fmtQtd(valor)} kg por viagem` : 'capacidade não definida'}{podeEditar ? ' ✎' : ''}
      </span>
    )
  }
  return (
    <span className="chip" style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }}>
      🚛 <input className="filtro-input" style={{ width: 90 }} inputMode="decimal" autoFocus
        value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="kg" />
      <button className="mini-btn" disabled={salvando} onClick={salvar}>{salvando ? '…' : '✓'}</button>
      <button className="mini-btn" onClick={() => setEditando(false)}>✕</button>
    </span>
  )
}

// ---------- PLANEJAMENTO: a lista de previsões abertas ----------
// A carga NASCE de um plano. Antes a viagem se montava marcando pedidos numa
// lista solta — servia para "carregar o que está pronto agora", mas não para
// programar: não dava para reservar lugar para o pedido que ainda está no silk,
// nem para olhar a rota inteira antes do dia.
function ListaPlanos({ planos, resumo, todos, cadastros, salvando, onAbrir, onCriar, onExcluir,
                       gruposProntos, prontosSemPlano, planoDaData, onJuntar, clientes,
                       livresPorPedido,
                       filtros, setFiltros, baseFiltro, totalPlanos, baseSeletores, rotasFiltro }) {
  const [novo, setNovo] = useState(false)
  const [dataEntrega, setDataEntrega] = useState('')
  const [saida, setSaida] = useState('')

  // O que a data escolhida pega, ANTES de criar: é o tamanho do dia, e sem ele
  // a pessoa só descobre o que pediu depois que a previsão existe.
  const previa = dataEntrega
    ? todos.filter((p) => entregaAte(p, dataEntrega)
        && (livresPorPedido.has(String(p.idVenda)) || temTrabalhoNaProducao(p)))
    : []
  const previaProntos = previa.filter((p) => livresPorPedido.has(String(p.idVenda))).length
  const previaRotas = agrupaPlanoPorRota(previa, cadastros).length

  function criar() {
    if (!dataEntrega) { alert('Escolha a data de entrega da viagem.'); return }
    if (planoDaData(dataEntrega)
      && !confirm(`Já existe uma previsão para ${fmtData(dataEntrega + 'T00:00:00')} `
        + `(#${planoDaData(dataEntrega).numero}).\n\nCriar outra assim mesmo?`)) return
    onCriar({ dataEntrega, saidaPrevista: saida })
    setNovo(false); setDataEntrega(''); setSaida('')
  }

  return (
    <>
      {novo ? (
        <div className="card em_dia" style={{ marginBottom: 18, borderLeftColor: 'var(--accent)' }}>
          <h3 style={{ marginBottom: 12 }}>Nova previsão de entrega</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field">
              <label>Data de entrega</label>
              <input type="date" className="filtro-input filtro-date" value={dataEntrega}
                onChange={(e) => setDataEntrega(e.target.value)} />
            </div>
            <div className="field">
              <label>Saída prevista (opcional)</label>
              <input type="date" className="filtro-input filtro-date" value={saida}
                onChange={(e) => setSaida(e.target.value)} />
            </div>
            <button className="btn ok" disabled={!!salvando} onClick={criar}>
              {salvando === 'plano' ? 'Criando…' : '✓ Criar previsão'}
            </button>
            <button className="btn" onClick={() => setNovo(false)}>Cancelar</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 10 }}>
            {dataEntrega
              ? <>A viagem pega <b>{previa.length}</b> pedido(s) com entrega até{' '}
                  {fmtData(dataEntrega + 'T00:00:00')} · <b>{previaProntos}</b> pronto(s) ·{' '}
                  <b>{previaRotas}</b> rota(s). Os atrasados entram — são os que não podem
                  perder mais um caminhão.</>
              : 'A previsão é do DIA: escolha a data de entrega e a viagem leva tudo que vence '
                + 'até ela, de todos os vendedores. Vendedor e rota são filtros lá dentro.'}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <button className="btn primary" onClick={() => setNovo(true)}>+ Nova previsão de entrega</button>
        </div>
      )}

      {/* os seletores saem de TODOS os pedidos, não só dos prontos: vendedor que
          hoje não tem nada pronto sumia da lista, e com ele as rotas dele */}
      <FiltrosBar filtros={filtros} setFiltros={setFiltros}
        vendedores={vendedoresDe(baseSeletores)} pedidos={baseSeletores} rotas={rotasFiltro} />
      {resumoFiltros(filtros) && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 2px 12px' }}>
          {resumoFiltros(filtros)}
        </div>
      )}

      {/* As PREVISÕES vêm primeiro: são o documento de trabalho, o que a pessoa
          volta para abrir. O estoque pronto é matéria-prima e fica embaixo —
          invertido, seis previsões sumiam atrás de dezenas de cards de estoque
          e ninguém achava a aba pelo próprio nome. */}
      <div className="sug-titulo" style={{ margin: '0 2px 8px' }}>
        📋 Previsões abertas
        {totalPlanos > 0 && <small>{totalPlanos} viagem(ns) em montagem</small>}
      </div>
      {planos.length === 0 ? (
        <div className="empty"><div className="big">📋</div>
          {totalPlanos > 0
            ? `Nenhuma das ${totalPlanos} previsão(ões) abertas bate com esses filtros.`
            : <>Nenhuma previsão aberta. Crie uma para montar a viagem de um DIA — dá para
                pôr pedidos que ainda estão na produção, não só os que já ficaram prontos.</>}
        </div>
      ) : (
        <div className="cards">
          {/* ordem = o dia da viagem; a saída prevista só desempata o legado */}
          {planos.slice().sort((a, b) =>
            (a.dataEntrega || a.saidaPrevista || '9999').localeCompare(b.dataEntrega || b.saidaPrevista || '9999')
            || (Number(a.numero) || 0) - (Number(b.numero) || 0)).map((pl) => {
            const r = resumo(pl)
            return (
              <div key={pl.id} className="card em_dia plano-card">
                <div className="card-top">
                  <div className="cliente">{rotuloPlano(pl)}</div>
                  <div className="idv">#{pl.numero}</div>
                </div>
                <div className="meta-row">
                  {/* a previsão do dia atravessa vendedor: o card diz para onde
                      o caminhão vai, senão só a data não conta nada */}
                  {planoPorData(pl)
                    ? (r.rotas.length === 0
                        ? <span className="chip">vazia — abra e escolha os pedidos</span>
                        : <>
                            {r.rotas.slice(0, 2).map((g) => (
                              <span key={g.chave} className="chip">📍 {g.rota} · {g.vendedor}</span>
                            ))}
                            {r.rotas.length > 2 && <span className="chip">+{r.rotas.length - 2} rota(s)</span>}
                          </>)
                    : <span className="chip">👤 {pl.vendedor || '—'}</span>}
                  {pl.saidaPrevista && <span className="chip">🚚 saída {fmtData(pl.saidaPrevista + 'T00:00:00')}</span>}
                </div>
                <div className="pl-est ok" style={{ marginTop: 8 }}>
                  <b>{r.total}</b> pedido(s) na previsão · <b>{r.prontos}</b> pronto(s)
                </div>
                {r.volumes > 0 && (
                  <div className="pl-est">📦 {r.volumes} volume(s) · {fmtPeso(r.peso)}</div>
                )}
                {r.total > r.prontos && (
                  <div className="pl-est falta">⏳ {r.total - r.prontos} ainda na produção</div>
                )}
                {r.deFora > 0 && (
                  <div className="pl-est falta">
                    ⚠ {r.deFora} {planoPorData(pl) ? 'de outra data' : 'de outras rotas'}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn ok" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => onAbrir(pl.id)}>Abrir</button>
                  <button className="btn" disabled={!!salvando} onClick={() => onExcluir(pl)}
                    title="Excluir a previsão: os pedidos ficam livres e o número fica no histórico">
                    {salvando === `del:${pl.id}` ? '…' : '🗑'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {prontosSemPlano > 0 && (
        <div className="prontos-bloco">
          <div className="sug-titulo" style={{ margin: '0 2px 8px' }}>
            📦 Prontos sem previsão
            <small>{prontosSemPlano} pedido(s) expedidos e ainda fora de qualquer viagem</small>
          </div>
          <div className="cards">
            {gruposProntos.map((g) => {
              const jaTem = g.dia ? planoDaData(g.dia) : null
              return (
                <div key={g.chave} className="card em_dia">
                  <div className="card-top">
                    <div className="cliente">
                      📅 {g.dia ? fmtData(g.dia + 'T00:00:00') : 'sem data de entrega'}
                    </div>
                    <div className="idv">{g.pedidos.length}</div>
                  </div>
                  {/* as rotas de dentro do dia: é o que diz se o dia é uma
                      viagem só ou três */}
                  <div className="meta-row">
                    {g.rotas.slice(0, 3).map((r) => (
                      <span key={r.chave} className="chip">📍 {r.rota} · {r.vendedor}</span>
                    ))}
                    {g.rotas.length > 3 && <span className="chip">+{g.rotas.length - 3}</span>}
                  </div>
                  <div className="pl-est ok" style={{ marginTop: 6 }}>
                    📦 {g.volumes.length} volume(s) · {fmtPeso(g.peso)}
                  </div>
                  <ul className="itens" style={{ marginTop: 6 }}>
                    {g.pedidos.slice(0, 4).map((p) => (
                      <li key={p.idVenda}>
                        <span>{nomeCliente(p.cliente, clientes)}</span>
                        <span className="q">#{p.idVenda}</span>
                      </li>
                    ))}
                    {g.pedidos.length > 4 && (
                      <li><span style={{ color: 'var(--text-faint)', textTransform: 'none' }}>
                        e mais {g.pedidos.length - 4}…
                      </span></li>
                    )}
                  </ul>
                  <button className="btn ok sug-btn" disabled={!!salvando || !g.dia}
                    title={g.dia ? '' : 'Sem data de entrega não dá para montar a viagem do dia — '
                      + 'defina a data no pedido (Produção ou Rota)'}
                    onClick={() => jaTem
                      ? onJuntar(jaTem, g)
                      : onCriar({ dataEntrega: g.dia, saidaPrevista: '',
                                  pedidos: g.pedidos.map((p) => p.idVenda) })}>
                    {jaTem
                      ? `+ Pôr na previsão #${jaTem.numero}`
                      : g.dia
                        ? `+ Criar previsão do dia ${fmtData(g.dia + 'T00:00:00')}`
                        : 'sem data — defina a entrega no pedido'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {prontosSemPlano === 0 && baseFiltro.length > 0 && resumoFiltros(filtros) && (
        <div className="prontos-bloco" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          📦 Nenhum dos {baseFiltro.length} pedido(s) prontos bate com esses filtros.
        </div>
      )}

    </>
  )
}

// quantos pedidos de outras rotas a busca desenha de uma vez
const LIMITE_BUSCA = 40

// filtro por SITUAÇÃO do pedido na fábrica
const SITUACOES = [
  { id: 'todos', nm: 'Todos', dica: 'Tudo que pode entrar na viagem' },
  { id: 'pronto', nm: '✅ Prontos', dica: 'Já tem volume expedido, dá para carregar agora' },
  { id: 'montagem', nm: '📦 Na montagem', dica: 'Está sendo embalado — sai em breve' },
  { id: 'linha', nm: '🏭 Na linha', dica: 'Ainda em silk, clichê ou gráfica' },
]

// ---------- PLANEJAMENTO: montar UMA viagem ----------
// Duas listas: o que está NESTA viagem e o que ainda dá para pôr. Todo pedido
// diz onde está — pronto (com volumes e peso) ou em que setor da fábrica. Esse
// segundo dado é o motivo da tela existir: sem ele o planejamento é um chute.
function PlanoAberto({ plano, dentro, fora, todos, deOutrasRotas,
                       livresPorPedido, noutroPlano, itensCad, clientes,
                       cadastros, totais, peso, capacidadeKg, prontos, volumes,
                       motorista, setMotorista, motoristas, salvando, temCargaAberta,
                       filtros, setFiltros, onVoltar, onAlterna, onAlternaTodos,
                       onLiberar, onEncerrar, onDevolver }) {
  const [outras, setOutras] = useState(false)
  const [situacao, setSituacao] = useState('todos')
  // quem monta papel não é quem monta plástico — na hora de cobrar o serviço, a
  // lista misturada obriga cada setor a garimpar o que é dele
  const [material, setMaterial] = useState('')

  // Onde o pedido está: pronto para carregar, ou parado em que parte da fábrica.
  // Planejar é decidir por prazo — "o que já dá para levar" e "o que sai da
  // montagem a tempo" são perguntas diferentes, e a lista misturada não responde
  // nenhuma das duas.
  const casaSituacao = (p) => {
    if (situacao === 'todos') return true
    const pronto = (livresPorPedido.get(String(p.idVenda)) || []).length > 0
    if (situacao === 'pronto') return pronto
    const pend = pendenciasDoPedido(p)
    if (situacao === 'montagem') return pend.some((x) => x.etapa === 'montagem')
    if (situacao === 'linha') return pend.some((x) => MODO_ORDER.includes(x.etapa))
    return true
  }
  // material é filtro de ITEM: o pedido fica se tiver algum item do material, e
  // dentro do card só esses itens aparecem (mesma regra da Lista de Produção)
  const casaMaterial = (p) => !material
    || (p.itens || []).some((it) => materialDoItem(it, itensCad) === material)
  const casaTudo = (p) => casaSituacao(p) && casaMaterial(p)
  const foraV = fora.filter(casaTudo)
  const outrasV = deOutrasRotas.filter(casaTudo)
  const estoura = capacidadeKg > 0 && peso.kg > capacidadeKg
  const forasteiros = dentro.filter((p) => !doPlano(p, plano)).length

  // O que a folha de pendências cobre: exatamente o que está na TELA — a viagem
  // mais a lista da direita como ela está filtrada. Imprimir mais do que se vê
  // faria a folha e a tela discordarem, e é a folha que vai para a fábrica.
  const visivel = outras ? outrasV : foraV
  const jaDentro = new Set(dentro.map((p) => String(p.idVenda)))
  const paraImprimir = [...dentro, ...visivel.filter((p) => !jaDentro.has(String(p.idVenda)))]
  const porData = planoPorData(plano)

  // Com o DIA inteiro na tela, a lista solta vira um paredão e ninguém enxerga
  // a viagem. Agrupa por ROTA × VENDEDOR, com as CIDADES à vista — a "ROTA 02"
  // da GLAYCE às vezes é a mesma região da do Sérgio e às vezes não, e é quem
  // monta que decide. Na previsão antiga (uma rota só) não há o que agrupar.
  const renderLista = (lista, linha, comBotao) => (porData
    ? agrupaPlanoPorRota(lista, cadastros).map((g) => (
        <div key={g.chave} className="pg-bloco">
          <div className="pg-rota">
            <span className="pg-nm">📍 {g.rota} · {g.vendedor}</span>
            <span className="pg-n">{g.pedidos.length}</span>
            {comBotao && (
              <button className="mini-btn" disabled={!!salvando}
                onClick={() => onAlternaTodos(true, g.pedidos)}>+ pôr os {g.pedidos.length}</button>
            )}
          </div>
          {g.cidades.length > 0 && <div className="pg-cidades">{g.cidades.join(' · ')}</div>}
          {g.pedidos.map(linha)}
        </div>
      ))
    : lista.map(linha))

  // com o dia inteiro na lista, um clique pode arrastar 100 pedidos
  const porTodos = () => {
    if (foraV.length > 20
      && !confirm(`Pôr TODOS os ${foraV.length} pedidos visíveis nesta viagem?`)) return
    onAlternaTodos(true, foraV)
  }

  const legenda = [
    `${dentro.length} nesta viagem`,
    `${visivel.length} ${outras
      ? 'da busca em todo o sistema'
      : porData ? `disponível(is) até ${fmtData(plano.dataEntrega + 'T00:00:00')}` : 'disponível(is) desta rota'}`,
    situacao !== 'todos' && `situação: ${SITUACOES.find((x) => x.id === situacao)?.nm}`,
    material && `só ${MATERIAIS.find((x) => x.id === material)?.nome}`,
    resumoFiltros(filtros),
  ].filter(Boolean).join(' · ')
  return (
    <>
      <div className="plano-head no-print">
        <button className="btn" onClick={onVoltar}>← Previsões</button>
        <div>
          <div className="ph-titulo">{rotuloPlano(plano)} <small>#{plano.numero}</small></div>
          <div className="ph-sub">
            {porData
              ? `entrega até ${fmtData(plano.dataEntrega + 'T00:00:00')} · todos os vendedores`
              : (plano.vendedor || '—')}
            {plano.saidaPrevista && ` · saída prevista ${fmtData(plano.saidaPrevista + 'T00:00:00')}`}
          </div>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => window.print()}
          title="Folha com o que ainda está em produção, agrupado por setor">
          🖨 Pendências
        </button>
        <button className="btn" onClick={onEncerrar} title="Tira esta previsão da lista de abertas">
          Encerrar previsão
        </button>
      </div>

      <div className="plano-cols no-print">
        {/* ---- nesta viagem ---- */}
        <div className="plano-col">
          <div className="pc-head">
            🚚 Nesta viagem <span className="pc-n">{dentro.length}</span>
            {forasteiros > 0 && (
              <span className="chip rota-warn"
                title={porData ? 'Pedidos com entrega em outra data' : 'Pedidos que não são desta rota'}>
                +{forasteiros} de fora
              </span>
            )}
            {dentro.length > 0 && (
              <button className="mini-btn" style={{ marginLeft: 'auto' }}
                onClick={() => onAlternaTodos(false)}>tirar todos</button>
            )}
          </div>
          {dentro.length === 0
            ? <div className="pc-vazio">Nada na previsão ainda. Marque ao lado o que vai nesta viagem.</div>
            : renderLista(dentro, (p) => (
                <LinhaPlano key={p.idVenda} p={p} clientes={clientes} itensCad={itensCad}
                  livres={livresPorPedido.get(String(p.idVenda))} dentro material={material}
                  deFora={!doPlano(p, plano)} porData={porData}
                  salvando={salvando} onAlterna={() => onAlterna(p)} onDevolver={onDevolver} />
              ))}
        </div>

        {/* ---- o resto da rota, e a exceção: buscar fora dela ---- */}
        <div className="plano-col">
          <div className="pc-head">
            {outras
              ? '🔍 Buscar em todo o sistema'
              : porData
                ? `📋 Disponíveis até ${fmtData(plano.dataEntrega + 'T00:00:00')}`
                : '📋 Disponíveis desta rota'}
            <span className="pc-n">{outras ? outrasV.length : foraV.length}</span>
            {!outras && foraV.length > 0 && (
              <button className="mini-btn" style={{ marginLeft: 'auto' }}
                onClick={porTodos}>pôr todos</button>
            )}
          </div>
          <div className="pc-modos">
            <button className={`btn${outras ? '' : ' primary'}`} onClick={() => setOutras(false)}>
              {porData ? 'Da viagem' : 'Desta rota'}
            </button>
            <button className={`btn${outras ? ' primary' : ''}`} onClick={() => setOutras(true)}
              title={porData
                ? 'Trazer um pedido de outra data para esta viagem'
                : 'Trazer um pedido de outra rota ou de outro vendedor para esta viagem'}>
              {porData ? '🔍 Outras datas' : '🔍 Outras rotas'}
            </button>
          </div>

          {/* Na previsão do DIA o seletor de vendedor é essencial: a lista tem
              todos eles. Na previsão antiga (um vendedor só) ele não separaria
              nada — e por isso continua escondido lá. */}
          {/* ⚠️ `vendedores` sai de TODOS os pedidos, nunca da lista já filtrada:
              tirada da lista visível, escolher um vendedor apagaria os outros do
              seletor e não daria mais para trocar direto para outro. */}
          <FiltrosBar filtros={filtros} setFiltros={setFiltros} semVendedor={!outras && !porData}
            vendedores={vendedoresDe(todos)}
            pedidos={outras || porData ? todos : undefined} />

          <div className="pc-sit">
            {SITUACOES.map((x) => (
              <button key={x.id} className={`chip${situacao === x.id ? ' sit-on' : ''}`}
                onClick={() => setSituacao(x.id)} title={x.dica}>{x.nm}</button>
            ))}
            <select className="btn" value={material} onChange={(e) => setMaterial(e.target.value)}
              title="Filtrar por material — vale para a lista e para a folha de pendências">
              <option value="">Todos os materiais</option>
              {MATERIAIS.map((m) => <option key={m.id} value={m.id}>Só {m.nome}</option>)}
            </select>
          </div>

          {outras ? (
            outrasV.length === 0
              ? <div className="pc-vazio">
                  Nenhum pedido de fora {porData ? 'desta data' : 'desta rota'} bate com essa busca.
                </div>
              : <>
                  {outrasV.slice(0, LIMITE_BUSCA).map((p) => (
                    <LinhaPlano key={p.idVenda} p={p} clientes={clientes} itensCad={itensCad}
                      livres={livresPorPedido.get(String(p.idVenda))} material={material}
                      noutro={noutroPlano.get(String(p.idVenda))} deFora porData={porData}
                      salvando={salvando} onAlterna={() => onAlterna(p)} onDevolver={onDevolver} />
                  ))}
                  {/* corte VISÍVEL: lista truncada sem aviso passa a impressão de
                      que aquilo é tudo que existe */}
                  {outrasV.length > LIMITE_BUSCA && (
                    <div className="pc-vazio">
                      Mostrando {LIMITE_BUSCA} de <b>{outrasV.length}</b> — use os filtros
                      acima para achar o pedido que falta.
                    </div>
                  )}
                </>
          ) : (
            foraV.length === 0
              ? <div className="pc-vazio">
                  {fora.length > 0
                    ? `Nenhum dos ${fora.length} pedido(s) ${porData ? 'desta data' : 'desta rota'} está nessa situação.`
                    : porData
                      ? 'Nenhum pedido sobrando para esta data — tudo que vence até ela já está na viagem.'
                      : 'Nenhum pedido sobrando nesta rota.'}
                </div>
              : renderLista(foraV, (p) => (
                  <LinhaPlano key={p.idVenda} p={p} clientes={clientes} itensCad={itensCad}
                    livres={livresPorPedido.get(String(p.idVenda))} material={material}
                    noutro={noutroPlano.get(String(p.idVenda))} porData={porData}
                    salvando={salvando} onAlterna={() => onAlterna(p)} onDevolver={onDevolver} />
                ), true)
          )}
        </div>
      </div>

      {dentro.length > 0 && (
        <div className="batch-bar no-print">
          <span>
            <b>{prontos}</b> de {dentro.length} pronto(s) · <b>{volumes}</b> volume(s)
            {volumes > 0 && ` · ${fmtTotais(totais)}`}
            <b className={estoura ? 'peso-estoura' : ''}>
              {' · '}{fmtPeso(peso)}{capacidadeKg > 0 && ` de ${fmtQtd(capacidadeKg)} kg`}
            </b>
          </span>
          {motoristas.length > 0 && (
            <select className="btn" value={motorista} onChange={(e) => setMotorista(e.target.value)}>
              <option value="">🚚 Motorista…</option>
              {motoristas.map((m, i) => <option key={i} value={m.nome}>{m.nome}</option>)}
            </select>
          )}
          <button className="btn ok" disabled={!!salvando || !prontos || temCargaAberta}
            title={temCargaAberta ? 'Termine a carga que está em montagem antes de liberar outra' : ''}
            onClick={onLiberar}>
            {salvando === 'liberar' ? 'Liberando…' : `🚚 Liberar ${prontos} p/ entrega`}
          </button>
        </div>
      )}

      <ImpressaoPendencias plano={plano} pedidos={paraImprimir} itensCad={itensCad}
        clientes={clientes} legenda={legenda} material={material} />
    </>
  )
}

// ---------- folha de PENDÊNCIAS (o que falta para a viagem sair) ----------
// Não é romaneio: aqui nada está pronto. É o papel que se leva para o chão de
// fábrica para cobrar o serviço, e por isso vem agrupado por SETOR e não por
// pedido — quem cobra anda de posto em posto. Dentro do setor, quebra por
// MATERIAL: quem faz papel não é quem faz plástico. Cada linha tem quadradinho
// para marcar, o produto (com o selo da linha), o pedido/cliente e o prazo.
function ImpressaoPendencias({ plano, pedidos, clientes, itensCad, legenda, material }) {
  const grupos = pendenciasPorEtapa(pedidos, itensCad)
    .map((g) => {
      if (!material) return g
      const materiais = g.materiais.filter((m) => m.id === material)
      return { ...g, materiais, itens: materiais.flatMap((m) => m.itens) }
    })
    .filter((g) => g.itens.length > 0)
  const nItens = grupos.reduce((s, g) => s + g.itens.length, 0)
  return (
    <div className="print-only">
      <div className="pr-head">
        <h1>JC Sacolas · Pendências de produção · {rotuloPlano(plano)} #{plano.numero}</h1>
        <div className="meta">
          {fmtDataHora(new Date().toISOString())}<br />
          {planoPorData(plano)
            ? `entrega até ${fmtData(plano.dataEntrega + 'T00:00:00')}`
            : (plano.vendedor || '—')}
          {plano.saidaPrevista && ` · saída ${fmtData(plano.saidaPrevista + 'T00:00:00')}`}<br />
          {nItens} item(ns) em {grupos.length} setor(es)
        </div>
      </div>
      {/* a folha diz de onde saiu: impressa com filtro ligado, ela é PARTE do
          que existe, e sem esse aviso passa por lista completa */}
      <div className="pr-rota">{legenda}</div>
      {grupos.length === 0 ? (
        <div className="pr-obs">Nenhum item em produção nesta lista — está tudo pronto.</div>
      ) : grupos.map((g) => (
        <div key={g.etapa} className="pr-block">
          <div className="pr-vend">{g.nome} — {g.itens.length} item(ns)</div>
          {g.materiais.map((mg) => (
            <div key={mg.id || 'sem'} className="pr-mat-bloco">
              {/* o material aparece SEMPRE, mesmo quando só tem um: a folha vai
                  para postos diferentes, e cada um precisa achar a parte dele */}
              <div className="pr-mat">{mg.nome} · {mg.itens.length} item(ns)</div>
              <table className="pr-itens"><tbody>
                {mg.itens.map((it, i) => (
                  <tr key={`${it.p.idVenda}-${it.key}-${i}`}>
                    <td className="chk"><span className="box" /></td>
                    <td>
                      <SeloLinha linha={it.linha} />{it.produto}
                      {/* a folha do dia atravessa vendedores: sem a rota, quem
                          cobra não sabe de qual viagem aquele item é */}
                      <span className="ref"> · #{it.p.idVenda} {nomeCliente(it.p.cliente, clientes)}
                        {it.p.cidade ? ` · ${it.p.cidade}` : ''}
                        {planoPorData(plano) ? ` · ${it.p.rota || 'SEM ROTA'}` : ''}</span>
                    </td>
                    <td className="q">{fmtQtd(it.qtd)}</td>
                    <td className="q">{fmtData(it.p.previsao)}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// uma linha de pedido no planejamento: diz se está pronto ou onde está na fábrica
function LinhaPlano({ p, clientes, itensCad, livres, dentro, noutro, deFora, porData, material, salvando, onAlterna, onDevolver }) {
  // Clicar no pedido abre os PRODUTOS. Fechado por padrão: a lista precisa caber
  // na tela para escolher a viagem; aberta em todos, viraria uma parede de texto.
  // Mas na hora de decidir o que sobe no caminhão, o que importa é o produto —
  // "3 volumes" não diz se é a sacola grande ou a etiqueta.
  const [aberto, setAberto] = useState(false)
  const s = situacaoNoPlano(p, livres, itensCad)
  const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
  // com filtro de material, o card mostra SÓ os itens desse material — e o
  // resumo "⏳ N em Montagem" sai da mesma lista filtrada, senão a linha diria 3
  // e a lista aberta logo abaixo mostraria 1
  const doMaterial = (it) => !material || materialDoItem(it, itensCad) === material
  const itens = (p.itens || []).map((it, i) => ({ it, i })).filter(({ it }) => doMaterial(it))
  const pendencias = material
    ? resumePendencias(itensPendentesDoPedido(p, itensCad).filter((x) => x.material === material))
    : s.pendencias
  const nItens = itens.length
  return (
    <div className={`pl-linha${s.pronto ? ' pronto' : ''}`}>
      <button className={`btn${dentro ? '' : ' ok'} pl-acao`} disabled={!!salvando || (!dentro && !!noutro)}
        title={noutro ? `Já está no plano #${noutro.numero}` : ''}
        onClick={onAlterna}>{dentro ? '−' : '+'}</button>
      <div className="pl-corpo">
        <div className="pl-top pl-abre" onClick={() => setAberto((v) => !v)}
          title={aberto ? 'Fechar os produtos' : 'Ver os produtos deste pedido'}>
          <b><span className="pl-seta">{aberto ? '▾' : '▸'}</span> {nomeCliente(p.cliente, clientes)}</b>
          <span className="idv">#{p.idVenda}</span>
        </div>
        <div className="pl-meta">
          <span className="chip">📍 {p.cidade || '—'}</span>
          <span className={`chip${atrasado ? ' atrasado' : ''}`}>{fmtData(p.previsao)}</span>
          {/* de onde ele veio: sem isto a viagem muda de itinerário e só se
              descobre na hora de carregar */}
          {deFora && (
            <span className="chip rota-warn">
              ⚠ {porData
                ? `outra data · ${p.rota || 'SEM ROTA'}`
                : `${p.rota || 'SEM ROTA'} · ${p.vendedor || '—'}`}
            </span>
          )}
          {noutro && !dentro && <span className="chip rota-warn">no plano #{noutro.numero}</span>}
        </div>
        {s.pronto && (
          <div className="pl-est ok">
            ✅ pronto · {s.volumes} volume(s) · {fmtPeso(s.peso)}
            {dentro && (
              <button className="mini-btn" style={{ marginLeft: 8 }} disabled={!!salvando}
                title="Volta para a coluna Expedição do quadro"
                onClick={() => onDevolver({ p })}>↩ expedição</button>
            )}
          </div>
        )}
        {/* onde o resto está: é o que diz se falta um dia ou uma semana */}
        {pendencias.length > 0 && (
          <div className="pl-est falta">
            ⏳ {pendencias.map((x) => `${x.itens} em ${x.nome}`).join(' · ')}
          </div>
        )}
        {!aberto && nItens > 0 && (
          <button className="pl-veritens" onClick={() => setAberto(true)}>
            ▸ ver {nItens} produto(s)
          </button>
        )}
        {aberto && (
          <ul className="pl-itens">
            {itens.map(({ it, i }) => {
              const chave = it.key || keyDoItem(p, i)
              const vols = (livres || []).filter((v) => v.itemKey === chave)
              const falta = qtdEmProducao(p, i)
              return (
                <li key={i}>
                  <div className="pli-nome">
                    <SeloLinha linha={linhaDoItem(p, i)} />{it.produto}
                  </div>
                  <div className="pli-est">
                    {vols.length > 0 && (
                      <span className="ok">✅ {vols.length} vol · {fmtPeso(pesoDaLista(vols, itensCad))}</span>
                    )}
                    {falta > 0 && (
                      <span className="falta">⏳ {fmtQtd(falta)} em {nomeEtapaItem(etapaDoItem(p, i)) || '—'}</span>
                    )}
                    {vols.length === 0 && falta <= 0 && <span>—</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {/* simétrico ao "ver N produto(s)": aberto, o único jeito de fechar era
            clicar no nome do cliente — que não parece clicável, e a pessoa fica
            procurando o botão que não existe */}
        {aberto && (
          <button className="pl-veritens" onClick={() => setAberto(false)}>
            ▾ fechar produtos
          </button>
        )}
      </div>
    </div>
  )
}


// ---------- conferir e marcar a saída ----------
function Conferencia({ carga, pedidos, clientes, cadastros, itensCad, salvando, onConferir, onConferirTudo, onSaida, onCancelar, onTirar }) {
  const { total, conferidos } = progressoConferencia(carga)
  const grupos = agrupaCargaPorPedido(carga, pedidos)
  const pronto = cargaConferida(carga)
  const idxDe = (it) => (carga.itens || []).findIndex((x) => chaveCarga(x) === chaveCarga(it))
  return (
    <>
      <div className={`card ${pronto ? 'em_dia' : ''} no-print`} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Rota de entrega {rotuloCarga(carga)}</h3>
          {carga.planoNumero > 0 && (
            <span className="chip" title="A previsão que gerou esta viagem">
              📋 previsão #{carga.planoNumero}{carga.viagem > 1 ? ` · ${carga.viagem}ª viagem` : ''}
            </span>
          )}
          {carga.motorista && <span className="chip">🚚 {carga.motorista}</span>}
          <span className="chip">{(carga.rotas || []).join(' · ') || '—'}</span>
          <span className={`chip${pronto ? '' : ' rota-warn'}`} style={pronto ? { color: 'var(--ok)' } : null}>
            {conferidos} de {total} volumes conferidos
          </span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn" onClick={() => onConferirTudo(carga, !pronto)}>
            {pronto ? 'Desmarcar tudo' : '✓ Conferir tudo'}
          </button>
          <button className="btn" onClick={() => window.print()}>🖨 Romaneio</button>
          <button className="btn ok" disabled={!!salvando} onClick={() => onSaida(carga)}>
            {salvando === 'saida' ? 'Registrando…' : '🚚 Marcar saída'}
          </button>
          <button className="btn" style={{ color: 'var(--danger)' }}
            onClick={() => onCancelar(carga)}>Cancelar carga</button>
        </div>
      </div>

      <div className="screen-only">
        {grupos.map((g) => (
          <div key={g.idVenda} className="card em_dia" style={{ marginBottom: 12 }}>
            <div className="card-top">
              <div className="cliente">{g.p ? nomeCliente(g.p.cliente, clientes) : `#${g.idVenda}`}</div>
              <div className="idv">#{g.idVenda}</div>
              <button className="btn no-print" disabled={!!salvando}
                style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }}
                title="Tirar este pedido da carga — ele volta para a expedição"
                onClick={() => onTirar(carga, g.idVenda)}>↩ tirar da carga</button>
            </div>
            {g.p && (
              <div className="meta-row">
                <span className="chip">📍 {g.p.cidade || '—'}</span>
                <span className="chip">{g.p.rota || 'SEM ROTA'}</span>
              </div>
            )}
            <ul className="itens">
              {g.itens.map((it) => (
                <li key={chaveCarga(it)}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, cursor: 'pointer' }}>
                    <input type="checkbox" className="card-check" checked={!!it.conferido}
                      onChange={(e) => onConferir(carga, idxDe(it), e.target.checked)} />
                    <span style={it.conferido ? { textDecoration: 'line-through', opacity: .6 } : null}>
                      <SeloLinha linha={it.linha} />{it.produto}
                      {it.volumeN > 0 && <small className="q-de"> · volume {it.volumeN}</small>}
                    </span>
                  </label>
                  <span className="q">{fmtQtd(it.qtd)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <RomaneioCarga carga={carga} grupos={grupos} clientes={clientes} cadastros={cadastros} />
    </>
  )
}

// ---------- romaneio impresso da carga ----------
// Um BLOCO POR ROTA. A previsão é do DIA, então quase toda viagem leva mais de
// uma rota, e numa lista corrida o motorista tinha que separar de cabeça quais
// paradas eram da mesma. A SEQUÊNCIA das cidades continua não existindo: quem
// decide a ordem na estrada é ele (decisão do dono).
function RomaneioCarga({ carga, grupos, clientes, cadastros }) {
  const blocos = agrupaRomaneioPorRota(grupos, cadastros)
  return (
    <div className="print-only">
      <div className="pr-head">
        <h1>JC Sacolas · Romaneio de Entrega · Rota {rotuloCarga(carga)}</h1>
        <div className="meta">
          {carga.dataEntrega
            ? `entrega ${fmtData(carga.dataEntrega + 'T00:00:00')}`
            : fmtData(carga.criadaEm)}<br />
          {carga.motorista ? `🚚 ${carga.motorista} · ` : ''}
          {pedidosDaCarga(carga).length} entrega(s) · {(carga.itens || []).length} volume(s)
          {carga.planoNumero > 0 && <><br />previsão #{carga.planoNumero}</>}
        </div>
      </div>
      {blocos.map((b) => (
        <div key={b.chave} className="pr-bloco">
          <div className="pr-rota forte">
            {b.rota}{b.vendedor ? ` · ${b.vendedor}` : ''}
            {' — '}{b.paradas.length} parada(s) · {b.volumes} volume(s)
            {b.cidades.length > 0 && <div className="pr-cidades">{b.cidades.join(' · ')}</div>}
          </div>
          {b.paradas.map((g) => (
            <div key={g.idVenda} className="pr-ped parada">
              <div className="top">
                <span className="box" />
                <span className="nm">{g.p ? nomeCliente(g.p.cliente, clientes) : `#${g.idVenda}`}</span>
                <span className="cid">— {g.p?.cidade || '—'}</span>
                <span className="ent">{g.p ? fmtData(g.p.previsao) : ''}</span>
              </div>
              <table className="pr-itens"><tbody>
                {g.itens.map((it) => (
                  <tr key={chaveCarga(it)}>
                    <td>
                      <SeloLinha linha={it.linha} />{it.produto}
                      {it.volumeN > 0 && <span className="ref"> · vol. {it.volumeN}</span>}
                      <span className="ref"> #{g.idVenda}</span>
                    </td>
                    <td className="q">{fmtQtd(it.qtd)}</td>
                  </tr>
                ))}
              </tbody></table>
              {/* produção parcial: o romaneio precisa dizer que sai só uma parte */}
              {g.itens.some((it) => it.qtdItem > it.qtd) && (
                <div className="pr-parcial">⚠ ENTREGA PARCIAL — parte do pedido segue em produção</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------- histórico das viagens ----------
function Historico({ cargas, planos, podeDesfazer, salvando, onRetornar }) {
  if (!cargas.length && !planos?.length) {
    return <div className="empty"><div className="big">🚚</div>Nenhuma viagem nem previsão no histórico ainda.</div>
  }
  const rotulo = { saiu: '🚚 saiu', cancelada: '↩ retornada', concluida: '✓ concluída' }
  return (
    <>
    {cargas.length > 0 && (
    <div className="card em_dia" style={{ overflowX: 'auto' }}>
      <table className="rel-tab">
        <thead>
          <tr>
            <th>Viagem</th><th>Saída</th><th>Motorista</th><th>Rotas</th>
            <th className="q">Pedidos</th><th className="q">Volumes</th><th>Status</th>
            {podeDesfazer && <th></th>}
          </tr>
        </thead>
        <tbody>
          {cargas.map((c) => (
            <tr key={c.id}>
              <td>{rotuloCarga(c)}</td>
              <td>{c.saiuEm ? fmtDataHora(c.saiuEm) : '—'}</td>
              <td>{c.motorista || '—'}</td>
              <td>{(c.rotas || []).join(' · ')}</td>
              <td className="q">{(c.pedidos || []).length}</td>
              <td className="q">{(c.itens || []).length}</td>
              <td>
                {rotulo[c.status] || c.status}
                {c.canceladaEm && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    por {c.canceladaPor || '—'} · {fmtDataHora(c.canceladaEm)}
                  </div>
                )}
              </td>
              {podeDesfazer && (
                <td>
                  {c.status === STATUS_CARGA.SAIU && (
                    <button className="btn" disabled={!!salvando}
                      title="Os pedidos voltam para a expedição e ficam livres para outra carga"
                      onClick={() => onRetornar(c)}>↩ Retornar p/ expedição</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    )}

    {/* PREVISÕES — o rastro que não existia. Antes, excluir apagava o documento:
        sumia quem planejou, quantos pedidos tinha e, pior, o NÚMERO voltava a ser
        usado pela previsão seguinte. */}
    {planos?.length > 0 && (
      <div className="card em_dia" style={{ overflowX: 'auto', marginTop: 16 }}>
        <div className="sug-titulo" style={{ margin: '0 2px 10px' }}>📋 Previsões encerradas</div>
        <table className="rel-tab">
          <thead>
            <tr>
              <th>Previsão</th><th>Entrega</th><th className="q">Pedidos</th>
              <th className="q">Viagens</th><th>Situação</th><th>Fechada por</th>
            </tr>
          </thead>
          <tbody>
            {planos.map((pl) => {
              const f = fechamentoDoPlano(pl)
              return (
                <tr key={pl.id}>
                  <td>#{pl.numero}</td>
                  <td>{pl.dataEntrega
                    ? fmtData(pl.dataEntrega + 'T00:00:00')
                    : (pl.rota ? `${pl.rota} · ${pl.vendedor || ''}` : '—')}</td>
                  {/* o que sobrou nela quando fechou: excluída com pedido dentro
                      é justamente o caso em que eles voltaram a ficar livres */}
                  <td className="q">{(pl.pedidos || []).length}</td>
                  <td className="q">{(pl.cargas || []).length}</td>
                  <td>{nomeStatusPlano(pl)}</td>
                  <td>
                    {f.por || '—'}
                    {f.em && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmtDataHora(f.em)}</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )}
    </>
  )
}
