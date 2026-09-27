# WHATSAPP — central de conversas ligada a clientes e pedidos (desenho)

> Desenho aberto e fechado em 27/09/2026. **Fase 0 (backend) ESCRITA, ainda não
> publicada** — ver a seção "Fase 0" e `backend/README.md`. Implementar por
> fases (0 → 5), testando entre uma e outra, como manda o método da casa.
>
> **"Parecido com o chat da Agência 100K"** = a caixa de entrada de WhatsApp do
> produto do próprio Raoni (repo `Agencia 100k`, mesma VPS): Evolution API por
> QR code, conversas com status e responsável, classificação por mensagem,
> fila do número desconhecido, assinatura `*Nome:*`, áudio nos dois sentidos.
> O que já foi testado lá é copiado daqui; o que é da fábrica (pedido, etapa,
> relógio, demanda com motivo) é o que este documento acrescenta.
>
> Papel de quem desenha isto: **Product Manager de atendimento (CRM/CS) com
> cabeça de operação industrial**. Numa agência, o que fez "o chat" foi um
> especialista em automação de atendimento; aqui o que importa não é o chat,
> é o que a fábrica descobre com ele. Por isso o documento gasta mais linhas
> em *demanda*, *motivo* e *cruzamento* do que em balão de mensagem.

## A tese em uma frase
**A conversa é o canal; a DEMANDA é a unidade que se mede.** Um cliente manda
dez mensagens sobre um pedido atrasado — isso é UMA demanda, do tipo "prazo",
ligada ao pedido #5458, atendida pelo Fulano em 40 minutos, resolvida (ou não).
Se o sistema só guardar mensagens, ele vira um WhatsApp Web com login. Se
guardar demandas, ele responde "quem gera atrito, por quê, e quanto custa".

## O que já existe e que o chat NÃO pode duplicar
| Já existe | Onde | Como o chat usa |
|---|---|---|
| Erro/reclamação ligada a pedido | coleção `problemas` (`CAMPOS_ERRO`, `docProblema`, aba Erros, ⚠ no card do quadro) | A reclamação que chega pelo WhatsApp **vira um `problemas`** com `origem: 'whatsapp'` — a fábrica já olha essa fila |
| "Onde está o pedido" | `Localizar.jsx` (`buscaGlobal`, `paradasDoItem`, `ondeProcurar`) | A resposta ao cliente sai daqui, e o bot da Fase 5 também |
| Quem fez o quê, quando | `auditoria` (append-only, com executor) | Cruzar reclamação × setor que estava com o item |
| Tempo parado por etapa | relógio da fila (`tempoNaEtapa`, `idadeDoPedido`) | "Cliente cobrou com o pedido há 9 dias na montagem" |
| Baixa financeira e cobrança | `cobrancas` / `movimentos` (FINANCEIRO.md) | Lembrete de vencimento e boleto pelo chat (Fase 3) |
| Canhoto assinado | FINANCEIRO.md, Fase 4 (só desenho) | A foto do canhoto **chega pelo chat do motorista** e se anexa à remessa |
| Apelido de cliente (de/para) | `config/cadastros.clientes` (`razao`, `nome`) | Ganha `telefones[]` — é o que liga o número ao cliente |
| Motoristas e vendedores | Cadastros (motorista já tem `telefone`) | Mesmo campo, mesma resolução |
| Assistente de voz | `responderPergunta()` (padrões locais) | A mesma lógica responde perguntas de texto no chat |

Regra: **nenhuma tela nova que responda pergunta que outra tela já responde.**
O chat mostra a resposta do `Localizar` dentro da conversa; não reimplementa.

---

## DECISÃO 0 — infraestrutura (FECHADA em 27/09/2026: VPS com Docker)
Hoje o app é estático (GitHub Pages) e fala com o Firestore direto do
navegador. **WhatsApp precisa de um servidor acordado 24h** para receber o
webhook da Meta (mensagem chegou) e para guardar o token de envio — token no
navegador é token público, e o repositório é público.

**Decisão:** o **site continua no GitHub Pages** (deploy igual ao de hoje) e
nasce um **backend Node num container Docker na VPS Linux** que já existe.
Firebase Auth e Firestore ficam onde estão — o banco não muda, o tempo real
de todas as telas continua vindo do `onSnapshot`. **Não precisa de Blaze.**

    navegador ──(Firestore SDK, como hoje)──▶ Firestore ◀──(Admin SDK)── backend na VPS
                                                                          ▲
    Meta (WhatsApp Cloud API) ──webhook──▶ https://api.jcproducao.totalicontabilidade.com.br/wa/webhook ┘

- **Domínio (decisão de 27/09/2026):** `api.jcproducao.totalicontabilidade.com.br`,
  registro A no DNS da Totali apontando para o IP da VPS — ao lado do site, que
  já vive em `jcproducao.totalicontabilidade.com.br`.
- **A VPS é a `totali` (`totali-prod-01`, 201.54.20.97)** — a mesma da Agência
  100K, do Ponto e do TotaliFinance, com **Traefik** nas portas 80/443 e
  **Portainer** publicando stacks a partir do git. O backend entra como a
  stack **`jcproducao`** (Portainer › Add stack › Repository, `refs/heads/main`,
  compose `backend/docker-compose.yml` + `backend/docker-compose.traefik.yml`),
  no mesmo padrão da agência. Nada de Caddy: o Traefik já faz o HTTPS.
- **Pasta `backend/`** no repo: Node 22 + Express, `Dockerfile` (contexto = raiz
  do repo, porque importa `src/utils.js`), compose com **três serviços** só na
  rede interna — `db` (Postgres da Evolution), `whatsapp` (Evolution API
  **v2.3.7**, a 2.4 exige licença) e `backend`. Roteamento por labels do
  Traefik na sobreposição.
- **Segredos só na stack do Portainer** (o Portainer não cria `.env`; cada
  variável entra por `${VAR:-}` no compose): chave da Evolution, token do
  webhook, conta de serviço do Firebase em base64, segredo das mídias.
  `backend/.env.example` versionado sem valores.
- **O backend escreve no Firestore com o Admin SDK**, que ignora as rules:
  por isso ele é o ÚNICO que grava `mensagens` com `de: 'nos'` e o status do
  WhatsApp. O navegador só enfileira em `enviar/`; o backend ouve a coleção
  (`onSnapshot` server-side), manda para a Meta e move para `mensagens`.
- **Mídia no disco da VPS** (`/dados/midia`, volume do Docker), servida pelo
  próprio backend com URL assinada e curta; `mensagens.midiaPath` guarda o
  caminho. ⚠️ **Backup do volume** entra na Fase 0 (rsync/restic diário para
  fora da VPS) — foto de canhoto perdida é comprovante de entrega perdido.
- **Saúde:** endpoint `/saude` + o painel de Atendimento mostra "backend
  fora do ar há N min" quando o backend para de atualizar
  `config/backend.vivoEm` (heartbeat a cada minuto). Sem isso o webhook cai
  e ninguém percebe até o cliente ligar.
- **Deploy do backend:** merge em `main` → Portainer › Stacks › jcproducao ›
  *Pull and redeploy*. ⚠️ **Nunca `docker compose up` à mão na VPS** (lição da
  agência: o `.env` da pasta não é o da stack, e derruba o WhatsApp). Separado
  do deploy do site, que não muda.

**De brinde, o mesmo container destrava três pendências antigas** que o
CLAUDE.md marca como "exige backend": o assistente de voz com LLM (Opção B),
a auditoria gravada fora do navegador (a brecha aceita de 15/08/2026) e a
redefinição de senha do login interno (Admin SDK). Ficam como endpoints
futuros do mesmo serviço, não como projetos à parte.

## DECISÃO 1 — qual WhatsApp (FECHADA em 27/09/2026: NÃO OFICIAL, por enquanto)
| Caminho | O que é | Prós | Contras |
|---|---|---|---|
| A. API oficial (Meta Cloud API) | O número vira um número "de API", gerido na Meta Business | Sem risco de banimento; conversa iniciada pelo cliente não é cobrada; templates | Exige conta Meta Business verificada (CNPJ) e dias de espera; mensagem iniciada pela empresa só por template pago; **não entra em grupos**; coexistência com o celular depende de parceiro (BSP) |
| **B. Evolution API (não oficial, por QR code)** — ESCOLHIDA | Um "WhatsApp Web" robotizado num container, como a Agência 100K já roda nesta VPS | Sobe em horas, sem conta Meta; **o número continua no celular sozinho** (é um aparelho conectado); **tudo que o escritório digita no celular também entra no sistema** (`fromMe`); entra em grupo; sem regra de 24 h nem template | **A Meta pode banir** números com comportamento de robô; sessão cai quando o celular fica muito tempo desligado |
| C. SaaS pronto (Chatwoot, Kommo, Umbler Talk) | Inbox de terceiros | Sai do zero rápido | Os dados ficam fora; o cruzamento com pedido/etapa/auditoria vira integração dupla; mensalidade |

**Decisão do Raoni (27/09/2026): B, "por enquanto", sem conta Meta.** Motivos:
velocidade, o número fica no celular (resolve a coexistência sem depender de
ninguém) e é o mesmo caminho já provado na agência. A Meta fica como troca
futura **sem perder histórico**: `conversas`/`mensagens` não sabem qual canal
gravou; só o backend muda.

⚠️ **Não oficial + número principal é a combinação de maior risco**, porque é
o número que não pode ser banido. Mitigações, todas em vigor:
1. **Comportamento humano, por construção:** o backend só manda o que uma
   pessoa digitou (`enviar/` com `porUid`) ou o aviso ligado ao pedido; **nada
   de disparo em massa**; aviso automático ao cliente fica **desligado** (já
   decidido); `alwaysOnline: false`, sem marcar como lido sozinho.
2. **Recomendação: começar num chip secundário por duas semanas** e só depois
   parear o principal. Se o dono quiser o principal desde o dia 1, é decisão
   dele — e fica registrada aqui.
3. Instância com `groupsIgnore: true`: o grupo da rota continua no celular e
   não entra no sistema (menos volume, menos ruído, menos risco).
4. Se o número cair, a página `/wa/qr` reconecta em um minuto; o heartbeat
   avisa a tela.

**BSP** = *Business Solution Provider*: parceiro da Meta que revende a API
oficial (Twilio, 360dialog, Gupshup, Take Blip…), com mensalidade e suporte. Só
volta a interessar se a decisão B for revista.

## DECISÃO 2 — a política de canal (a decisão mais operacional de todas)
O sistema **só enxerga o que passa pelo número da empresa.** A conversa que o
cliente tem no celular pessoal do vendedor, ou o grupo do motorista, não existe
para ele. Três opções, da mais forte à mais branda:

1. **Um número oficial "JC Sacolas — Atendimento"** para cliente, vendedor e
   motorista. Vendedor continua com o celular dele, mas a REGRA passa a ser:
   pedido, prazo, reclamação e cobrança passam pelo número da empresa.
2. **Um número por frente** (atendimento/produção · financeiro · logística) —
   mais caro de operar, ganha só se o volume separar filas de verdade. Não é o
   caso hoje.
3. **Sem regra, só registro**: quem atendeu fora do sistema **registra a
   demanda à mão** (botão "Registrar contato" em Meus Pedidos e no card).

**Recomendação: 1 + 3 juntas.** A medição não pode depender 100% do canal:
o vendedor que resolveu no celular dele registra em três toques (motivo,
pedido, resolvido?), e a estatística continua verdadeira. Sem o 3, o
relatório mediria só o que o escritório atende e culparia o escritório.

## Decisões (27/09/2026)
| Pergunta | Decisão | Consequência no desenho |
|---|---|---|
| Infra | **VPS Linux + Docker; site segue no Pages** | Decisão 0 |
| Número | **O número PRINCIPAL da fábrica, migrado** — só ele na Fase 1 | Os outros (dono, escritório, financeiro, vendedores) continuam no celular; entram um a um depois, cada um como uma caixa a mais na mesma conta Meta |
| Celular | **Precisa continuar no celular** | Resolvido pelo canal não oficial: o número fica no aparelho e o sistema é um "aparelho conectado" |
| Canal | **Evolution API (não oficial), por enquanto** | Decisão 1; Meta fica como troca futura sem perder histórico |
| Domínio | `api.jcproducao.totalicontabilidade.com.br` | Decisão 0 |
| Quem atende hoje | dono, designer/escritório, financeiro e cada vendedor, **cada um num WhatsApp** | É o cenário "vários canais, nenhum registro". Por isso o registro manual da demanda (3 toques) não é acessório: na Fase 1 ele captura o que os outros números atendem |
| Vendedor | **Só registra** | Vendedor não vê a caixa; ganha "Registrar contato" em Meus Pedidos (motivo + pedido + resolvido?). O escritório é quem responde o número principal |
| Aviso automático ao cliente | **Estrutura pronta, DESLIGADA** | `clientes[].notificar` existe desde a Fase 1 mas nenhum template de cliente é disparado até o dono ligar. Motorista e vendedor entram normalmente na Fase 3. Motivo: "a fábrica está muito desorganizada" — avisar o cliente de um prazo que não se cumpre piora, não melhora |
| Primeiro relatório | **Atrito por CLIENTE** + chip "cliente de atenção" na Triagem | Fase 4 começa por aí |
| Motivos | **Taxonomia v2 fechada**: 10 motivos, alteração como motivo próprio, foto obrigatória só em qualidade, gravidade + procedência ao resolver, SLA com padrões meus | Ver seção abaixo |

---|---|---|
| Número | o atual da fábrica migrado / número novo | Número novo "Atendimento" na Fase 1; migrar o antigo só depois de testado — o atual está nos cartões e na cabeça de todo cliente |
| Quem atende | staff (dono/designer/financeiro) / perfil novo `atendente` / vendedor atende o próprio cliente | Staff + perfil `atendente`; vendedor **vê** a conversa do cliente dele e pode responder (fica registrado como dele) |
| Fábrica vê o chat? | sim / não | **Não.** O operador vê o efeito (⚠ no card, faixa vermelha), nunca a conversa |
| Motivos de demanda | lista abaixo, editável em Cadastros | Fixa no código na Fase 1 (`MOTIVOS_DEMANDA`), editável na Fase 4 |
| Mensagem automática ao expedir / sair para entrega | sim / não | Sim, na Fase 3 — é o que **reduz** o "cadê meu pedido" que hoje vira ligação |
| Retenção das conversas | 1 ano / 2 anos / sempre | 2 anos, com a demanda (o resumo) guardada sempre |
| Vendedor vê conversa de cliente que não é dele | sim / não | Não (mesma regra de `pedidos`) |

---

## Modelo de dados

### `contatos/{telefone}` — quem é este número
    {
      telefone: '5579999990000',            // E.164, sem +, é o id
      nome: 'Maria (Atual Modas)',           // como a pessoa se apresenta / editado
      tipo: 'cliente'|'vendedor'|'motorista'|'fornecedor'|'outro'|'',
      clienteRazao: 'ATUAL MODAS LTDA',      // casa com p.cliente (via normaliza)
      vendedorNome: '',                      // quando tipo = vendedor
      motoristaNome: '',                     // quando tipo = motorista
      atencao: false,                        // "cliente de atenção" (derivado, Fase 4)
      criadoEm, atualizadoEm
    }
Resolução automática na primeira mensagem: telefone → `clientes[].telefones`,
`vendedores[].telefone`, `motoristas[].telefone`. Não achou → `tipo: ''` e a
conversa aparece com o chip **"contato não identificado — vincular"**. O
vínculo é feito UMA vez e vale para sempre (é o padrão dos apelidos).

### `conversas/{telefone}` — a caixa de entrada
    {
      telefone, contatoNome, tipo, clienteRazao,          // retrato do contato
      ultimaMsg: 'texto…', ultimaEm: iso, ultimaDe: 'cliente'|'nos',
      naoLidas: 2,
      responsavelUid, responsavelNome,                    // quem está com ela
      status: 'aberta'|'aguardando'|'fechada',            // aguardando = bola com o cliente
      etiquetas: ['prazo','vip'],
      demandaAbertaId: '' ,                               // a demanda em curso (uma por vez)
      // (sem janela de 24 h: é do canal oficial; se a Meta voltar, o campo `janelaAte` entra aqui)
    }
    conversas/{telefone}/mensagens/{id}
    {
      de: 'cliente'|'nos'|'sistema', porUid, porNome,     // 'sistema' = automática
      tipo: 'texto'|'imagem'|'audio'|'documento'|'template',
      texto, midiaPath, midiaMime,
      waId, statusWa: 'enviada'|'entregue'|'lida'|'falhou',
      idVenda: '',                                        // vínculo manual ou detectado
      demandaId: '',
      quando: iso
    }
⚠️ **Mensagem é append-only** (como `auditoria`): `update` só nos campos de
status do WhatsApp e no vínculo (`idVenda`/`demandaId`). Texto não se edita.

### `demandas/{id}` — a unidade que se mede
    {
      telefone, contatoNome, tipo,                        // de quem veio
      clienteRazao, vendedor, rota, cidade,               // retrato para filtro (igual cobrancas)
      idVenda: '5458' | '',                               // pedido ligado (pode ser vazio: orçamento)
      itemKey: '',                                        // opcional
      motivo: 'prazo',                                    // MOTIVOS_DEMANDA (v2, 10 motivos)
      submotivo: 'atrasado',                              // ver tabela
      origem: 'whatsapp'|'telefone'|'presencial'|'registro-manual',
      abertaEm, abertaPorUid,                              // quem abriu (ou 'auto' na Fase 5)
      primeiraRespostaEm,                                 // ⏱ TPR
      resolvidaEm, resolvidaPorUid, resolvidaNome,        // ⏱ TR
      status: 'aberta'|'aguardando-cliente'|'aguardando-fabrica'|'resolvida'|'reaberta',
      responsavelUid, responsavelNome,                    // quem atendeu
      problemaId: '',                                     // quando virou reclamação na fila da fábrica
      // retrato do PEDIDO no momento da abertura — é o que permite cruzar depois
      etapaNoMomento: 'montagem', diasNaEtapa: 9, atrasoDias: 3, previsao: '2026-09-24',
      ofNumero: '', linha: 'PRODUCAO', material: 'plastico',
      setorCausador: 'montagem'|'silk'|…|'',              // sugerido pelo sistema, confirmado por quem resolve
      gravidade: 'leve'|'media'|'grave'|'',               // obrigatório ao resolver
      procedencia: 'procedente'|'improcedente'|'parcial'|'', // obrigatório ao resolver
      desfecho: 'reproducao'|'desconto'|'devolucao'|'credito'|'reentrega'|'nova-data'|'aceito'|'',
      fotos: ['midia/…'],                                 // obrigatória em qualidade
      slaRespostaMin: 30, slaResolucaoH: 48,              // congelados na abertura (o padrão pode mudar depois)
      correcaoKey: '',                                    // alteracao → a `correcoes` gerada
      custoEstimado: 0,                                   // Fase 4, opcional
      obs
    }
**Por que o retrato do pedido vai congelado na demanda:** a regra da casa é
recalcular no render, mas aqui a pergunta é histórica — "em que situação o
pedido estava QUANDO o cliente reclamou". Amanhã o pedido anda e o retrato
some. É a mesma razão do `itens` na remessa de `entregues`.

### O que muda nos cadastros
- `clientes[]` ganha `telefones: []` (vários: o dono da loja, a compradora).
- `vendedores[]` ganha `telefone`.
- `motoristas[]` já tem.
- `usuarios/{uid}` ganha `atende: true` (eixo novo, como `setores`) — dono e
  designer podem atender sem marcar; `financeiro` atende só demandas de
  cobrança se `atende` estiver ligado.

### Rules (resumo)
- `contatos`, `conversas`, `mensagens`: lê e escreve staff + `atende`;
  vendedor lê/escreve só conversa cujo `clienteRazao` pertence a pedido dele
  (⚠️ precisa de `vendedor` gravado na conversa — retrato, como `problemas`).
  **Operador e expedição: nada.**
- `demandas`: mesma leitura; `create` também pelo vendedor (registro manual);
  `resolvidaEm` só por quem atende.
- Envio real (`mensagens` com `de: 'nos'`) é **escrito pelo backend da VPS**
  (Admin SDK), nunca pelo navegador: o cliente grava um doc em `enviar/{id}`
  (fila, `create` por quem atende), o backend manda para a Meta e move para
  `mensagens` com o `waId`. Token só no servidor.
- Publicar as rules ANTES do build, como sempre.

---

## Taxonomia de MOTIVOS — v2 (fechada em 27/09/2026)
> Sem taxonomia fixa, cada atendente escreve "problema no pedido" e o relatório
> não diz nada. A pergunta que organiza a lista não é "o que aconteceu", é
> **"o que o CLIENTE sente"** — porque é ele quem abre a demanda. De qual setor
> veio é o sistema que descobre, cruzando com o pedido.

Cada motivo tem: submotivos, setor causador **provável** (sugestão, quem
resolve confirma), campos obrigatórios ao ABRIR, desfechos possíveis e o
**prazo alvo** (SLA). `MOTIVOS_DEMANDA` em `src/utils.js`; editável em
Cadastros na Fase 4.

| # | Motivo | O que o cliente sente | Submotivos | Setor provável | Obrigatório ao abrir | Desfechos | SLA | Vira `problemas`? |
|---|---|---|---|---|---|---|---|---|
| 1 | **prazo** | "não chegou quando devia" | consulta ("cadê") · atrasado · urgência/antecipar | onde o relógio da fila aponta | pedido | nova data combinada · mantida · cancelado | consulta **30 min** (resposta) · atrasado **4 h** | não (é combinação de prazo) |
| 2 | **quantidade** | "veio quantidade diferente" | faltou · veio a mais · volume trocado com outro cliente | montagem (por material) · expedição/carga | pedido, item, qtd pedida × recebida | completar (reprodução parcial) · crédito · aceito | **2 dias** | **sim** (`campo: quantidade`) |
| 3 | **produto** | "não é o que pedi" | medida · modelo (alça/sem alça) · material · cor da impressão · arte/logo · acabamento (laminação, furo) | triagem (classificou errado) · vendedor (tirou errado) · OF (cor) | pedido, item, o que veio × o que pediu | reprodução · desconto · aceito | **2 dias** | **sim** (`campo: produto`) |
| 4 | **qualidade** | "é o que pedi, mas veio ruim" | impressão (borrada · falhada · descascando · fora de registro) · solda/fundo abrindo · alça soltando · rasgo/espessura · laminação (bolha · descolando) · corte/furo torto · sujeira/mancha | silk/clichê/gráfica · montagem | pedido, item, **FOTO** | reprodução · desconto · devolução | **2 dias** | **sim** (`campo: outro`, `qualidade: true`) |
| 5 | **entrega** | "chegou errado ou não chegou" | não chegou (sistema diz entregue) · endereço/local · horário · conduta do motorista · avaria no transporte · entregue a outro cliente · voltou sem entregar | expedição · carga · motorista | pedido, data | reentrega · localizado · crédito | **1 dia** | **sim** (`campo: cliente`) |
| 6 | **alteracao** | "quero mudar o pedido" (já em produção) | quantidade · arte · medida · cor · cancelar item | vendedor (pedido mal fechado) · cliente | pedido, item, o que muda | aceita (vira `correcoes`) · negada · aceita com custo | **4 h** | não — vira **`correcoes`** com o `demandaId` |
| 7 | **financeiro** | "a conta está errada / não chegou" | boleto não chegou · 2ª via · valor diferente do combinado · desconto não aplicado · cobrança de pedido pago · nota fiscal | financeiro | pedido ou cobrança | corrigido · esclarecido · improcedente | **4 h** | não — liga a `cobrancas` |
| 8 | **comercial** | "quero comprar / saber preço" | orçamento/preço · novo pedido · aprovação de arte · retirada na fábrica · prazo de produção | vendedor · designer | — | atendido · virou pedido · perdido | **1 dia** | não |
| 9 | **elogio** | "ficou bom" | — | — | — | — | — | não |
| 10 | **outro** | — | — | — | — | — | **1 dia** | não |

- **Alteração é motivo próprio (decisão de 27/09/2026):** é a maior fonte de
  retrabalho silencioso — quantidade, arte ou medida mudam depois da Triagem
  e ninguém sabe quem pediu. Como motivo próprio, conta por vendedor e por
  cliente, e a `correcoes` que já existe ganha o `demandaId` de quem pediu.
- **Foto obrigatória só em QUALIDADE:** sem foto, "impressão borrada" é
  palavra contra palavra e a fábrica não aprende nada. Em quantidade e
  entrega a foto é pedida, não exigida — nem sempre há o que fotografar.
- **`elogio` custa nada** e equilibra o relatório por cliente: cliente com 3
  reclamações e 12 elogios não é o mesmo que 3 e 0. Sem SLA, sem setor.
- **Setor provável é SUGESTÃO:** o sistema preenche pelo motivo + onde o item
  está/esteve (auditoria); quem resolve confirma ou troca (`setorCausador`).
  Sem essa confirmação o relatório por setor sairia de um chute.
- **O "cadê" é consulta, não reclamação.** Conta separado (é o volume que a
  Fase 3 deve derrubar) e não entra na taxa de atrito do cliente.

### Dois campos transversais, gravados AO RESOLVER (decisão de 27/09/2026)
- **`gravidade`**: leve · média · grave. Grave = cliente parou de comprar,
  devolução, reprodução inteira.
- **`procedencia`**: procedente · improcedente · parcial. **Sem isto o cliente
  que reclama sempre sem razão aparece igual ao que tem razão**, e o relatório
  de atrito por cliente mente contra a fábrica. Improcedente também é dado:
  cliente com muitas improcedentes é cliente que precisa de expectativa melhor
  combinada pelo vendedor.
- Os dois são **obrigatórios para fechar** a demanda (dois toques, só para
  quem resolve). Consulta ("cadê") e elogio não pedem.

### SLA (prazos alvo) — padrões, o dono ajusta
`SLA_DEMANDA` em utils, na Fase 2; editável em Cadastros na Fase 4. Demanda
estourada fica **vermelha na fila** e conta no relatório (`% dentro do prazo`
por motivo e por pessoa). A régua é a mesma do relógio da fila: **tempo
corrido**, não útil — é o que o cliente sente.

| Motivo | Primeira resposta | Resolução |
|---|---|---|
| prazo (consulta) | 30 min | — |
| prazo (atrasado), alteração, financeiro | 30 min | 4 h |
| entrega, comercial, outro | 30 min | 1 dia |
| quantidade, produto, qualidade | 30 min | 2 dias (dependem da fábrica) |

⚠️ **Primeira resposta é sempre 30 min**, seja qual for o motivo: o cliente
não sabe se o problema dele é "de 2 dias"; ele sabe se alguém respondeu.

---|---|---|---|
| **prazo** | atrasado · "cadê meu pedido" · antecipar | não (é consulta), salvo atraso confirmado | onde o item está (relógio) |
| **quantidade** | faltou · veio a mais · volume errado | **sim** (`campo: quantidade`) | montagem / expedição |
| **produto** | medida · cor da impressão · arte/layout · material | **sim** (`campo: produto`) | triagem / silk / gráfica |
| **qualidade** | impressão borrada · solda/alça · rasgo · laminação | **sim** (`campo: outro`, `qualidade: true`) | linha (silk/gráfica) / montagem |
| **entrega** | não chegou · endereço errado · motorista · avaria no transporte | **sim** (`campo: cliente`) | expedição / motorista |
| **financeiro** | boleto · 2ª via · desconto · cobrança indevida | não | financeiro |
| **comercial** | orçamento · preço · novo pedido · alteração antes de produzir | não | vendedor |
| **outro** | — | não | — |

Regra: motivo que **vira `problemas`** aparece no ⚠ do card na hora, com
`origem: 'whatsapp'` e o link para a demanda. A fábrica não abre o chat; ela
vê o erro na fila que já existe.

---

## A TELA (o que se copia do "chat da agência")
Três colunas, como toda inbox multiatendente:

    ┌──────────────┬────────────────────────────┬──────────────────────┐
    │ CONVERSAS    │ CONVERSA                   │ PAINEL DO CONTATO    │
    │ filtros:     │ balões, mídia, 24h ⏳       │ quem é (cliente/vend)│
    │ minhas ·     │ [detectou #5458 → vincular] │ pedidos abertos c/   │
    │ sem resp. ·  │ resposta rápida ▾           │  etapa + ⏱ + previsão│
    │ tipo · motivo│ "📍 Onde está" (Localizar) │ demanda em curso     │
    │ cliente/tel  │                            │  motivo · status ·   │
    │              │ [enviar]                   │  responsável         │
    │ ● não lidas  │                            │ histórico de demandas│
    │              │                            │ ⚠ problemas abertos  │
    └──────────────┴────────────────────────────┴──────────────────────┘

O que o painel da direita tem e a agência não: **os pedidos do contato com a
etapa, o tempo parado e a previsão** (reuso de `Localizar`), o botão **"Abrir
demanda"** (motivo + pedido em dois toques), e **"Virar reclamação na
fábrica"** (cria `problemas`). Respostas rápidas: "seu pedido está em X, previsão
dd/mm" preenchida com dado real, nunca digitada.

**Celular:** a expedição e o vendedor usam no celular. Coluna única com
navegação (lista → conversa → painel), 375px, como o quadro do vendedor.

**Onde entra no menu:** aba `atendimento` (badge de não lidas + demandas sem
responsável, como `errosAbertos`). Vendedor: aba dentro de Meus Pedidos.

---

## CRUZAMENTOS E RELATÓRIOS (o motivo do projeto)
> Tudo sai de `demandas` cruzado com `pedidos`/`entregues`/`auditoria`. Cada
> linha abaixo é uma pergunta que hoje ninguém consegue responder.

### Atrito — quem e por quê
| Pergunta | Cruzamento | Uso |
|---|---|---|
| Quais clientes mais reclamam? | demandas de reclamação (motivos 2–5, **procedentes**) por `clienteRazao` ÷ pedidos entregues do cliente | **taxa de atrito**, não contagem — 10 reclamações em 200 pedidos é bom; 3 em 4 é alarme. Improcedentes saem numa coluna própria: é outro problema (expectativa), com outro dono (vendedor) |
| Qual vendedor traz mais atrito? | por `vendedor`, quebrado por motivo | motivo "produto/medida" no vendedor = pedido mal tirado; "prazo" = promessa errada |
| Qual rota / cidade? | por `rota` + `cidade`, motivo entrega | rota com "não chegou" recorrente = problema de logística, não de fábrica |
| Qual motorista? | motivo entrega × `entregues.motorista` da remessa | avaria/atraso por motorista |
| Qual setor causa? | `problemaId` → auditoria: quem/qual setor tinha o item antes | reclamação de quantidade cai na montagem X ou Y (por material) |
| Qual produto / cor / OF? | `itemKey` + `ofNumero` + cor | OF de uma cor com 3 reclamações de impressão = tinta/tela daquele dia |
| Quanto custa o atrito? | `desfecho` (reprodução, desconto, devolução) × `valorTotal` | R$ de retrabalho por mês, por cliente, por vendedor |
| Cliente de atenção | 2+ reclamações **procedentes** em 90 dias (ou 1 grave) | chip ⚠ no card da **Triagem** e no quadro — quem produz sabe que aquele cliente já reclamou |

### Atendimento — quem resolve e quão rápido
| Pergunta | Métrica | Onde |
|---|---|---|
| Demandas por funcionário | count por `responsavelNome` / `resolvidaNome`, por período | Relatórios › Atendimento |
| Tempo de primeira resposta (TPR) | mediana e P85 de `primeiraRespostaEm − abertaEm`, por pessoa e por horário | mesma régua do relógio da fila (mediana/P85) |
| Tempo de resolução (TR) | `resolvidaEm − abertaEm`, por motivo | "financeiro resolve em 2h, qualidade em 6 dias" |
| Reabertura | `status: reaberta` ÷ resolvidas | resolvido que volta é o pior indicador |
| Fila sem dono | demandas abertas sem `responsavelUid` há > 30 min | badge vermelho no menu |
| Horário × dia da semana | mapa de calor de `abertaEm` | escala de quem atende (segunda 8h é o pico?) |

### Operação — o cruzamento que só esta fábrica consegue fazer
| Pergunta | Cruzamento |
|---|---|
| "Cadê meu pedido" chega em que etapa? | `etapaNoMomento` × `diasNaEtapa` — se 70% chega com o item na expedição, o problema é o caminhão, não a produção |
| Reclamação de prazo é atraso real? | `atrasoDias` no momento: cliente cobrando pedido **no prazo** = expectativa mal combinada pelo vendedor |
| Notificação automática reduz cobrança? | demandas "cadê" por semana, antes × depois da Fase 3 |
| Reclamação × relógio da fila | item que ficou > 7 dias num setor → quantas viraram demanda? (o relógio ganha um "custo") |
| Pedido com correção (`correcoes`) reclama depois? | `temCorrecao` × demandas de quantidade — correção da fábrica que o cliente não soube |
| Ciência do vendedor × reclamação | pedido **sem ciência** reclama mais? (dá peso real à aba Ciência) |
| Canhoto × "não recebi" | remessa **sem foto de canhoto** × demanda de entrega |

### Conversas com MOTORISTA e VENDEDOR (parâmetros)
- **Motorista:** ao marcar 🚚 saída, o sistema manda o **romaneio em PDF** e a
  lista de paradas; o motorista responde **foto do canhoto** por pedido —
  a foto se anexa à remessa (`entregues.canhotoPath`, o que a Fase 4 do
  FINANCEIRO já previa). Métrica: remessas com canhoto ÷ remessas; tempo
  entre saída e primeira foto; "voltou sem entregar" reportado pelo chat vira
  `retornados` na carga.
- **Vendedor:** recebe automático "pedido #N expedido" e "saiu para entrega"
  (ele para de perguntar para a fábrica); recebe **cobrança de ciência**
  ("3 pedidos sem ciência na ROTA 02 — abrir"); pode **registrar demanda** do
  cliente atendida no celular dele. Métrica: demandas registradas por vendedor
  (quem registra é quem está cuidando), TPR dele quando atende pelo número da
  empresa.
- **Cliente:** recebe "pedido pronto" / "saiu para entrega com JUNINHO,
  previsão hoje" (template de utilidade, pago, centavos) — decisão do dono se
  liga por cliente (alguns não querem).

---

## FASES

### Fase 0 — Fundação (sem tela) — ✅ ESCRITA em 27/09/2026, falta PUBLICAR
O que está no repositório:
- `src/utils.js`, seção WHATSAPP: `chaveTelefone` (nono dígito, DDI),
  `telefoneDoJid` (grupo/status/lid → null), `resolveContato` (telefone →
  cliente/vendedor/motorista pelos cadastros), `numerosDePedidoNoTexto`
  (`#5458`, `5.458`; ignora 44000+, 3 dígitos e telefone; com a lista dos
  pedidos conhecidos só devolve o que existe), `normalizaEventoWa` (o payload
  da Evolution vira `mensagem | status | conexao | ignorado`, defensivo),
  `docMensagemWa`, `resumoConversaWa`, `assinaTextoWa`, `backendVivo`.
  Testes: `tests/whatsapp.test.mjs` (`npm test`).
- `backend/`: `README.md` (passo a passo de subida), compose + sobreposição
  Traefik, `Dockerfile`, `src/` (`index.js` rotas, `receber.js` webhook →
  Firestore, `enviar.js` fila, `evolution.js` cliente, `midia.js` disco + URL
  assinada, `firestore.js` Admin + caches + heartbeat).
  - **Idempotente por construção:** o id do doc da mensagem é o `waId`, então
    o webhook repetido não duplica.
  - **Mensagem digitada no CELULAR também entra** (`fromMe` → `de: 'nos'`,
    `porNome: '📱 celular'`): o escritório pode continuar respondendo pelo
    aparelho e o sistema registra do mesmo jeito. É o maior ganho do canal
    não oficial para uma equipe que "atende em vários WhatsApps".
  - Sugestão de pedido por mensagem (`idVendasSugeridos`), a partir do texto
    cruzado com os `idVenda` vivos + entregues. O vínculo mesmo (`idVenda`) é
    confirmado por uma pessoa na Fase 1.
  - Página `/wa/qr?chave=…` para parear; `config/backend.vivoEm` a cada minuto.
- `firestore.rules`: `atende()` (staff + `usuarios.atende`), `contatos`,
  `conversas` + `mensagens` (nascem no backend; o navegador só lê e vincula;
  texto append-only), `enviar` (cria com `porUid` = logado e `status:
  'pendente'`, mais nada), `demandas` (vendedor cria/lê as suas). **Publicar
  ANTES do build da Fase 1.**

O que falta e é do Raoni (detalhado em `backend/README.md`): DNS
`api.jcproducao` → VPS; conta de serviço do Firebase; segredos; criar a stack
no Portainer; parear o celular; a prova do "oi" nos dois sentidos; backup dos
volumes `jcproducao_midia` e `jcproducao_whatsapp_instances`.

### Fase 1 — Inbox + vínculo (o "chat da agência")
Tela de 3 colunas; lista com filtros; enviar/receber texto e mídia; contato →
cliente/vendedor/motorista (`telefones[]` nos cadastros); detectar número de
pedido no texto e sugerir vínculo; painel com os pedidos do contato via
`Localizar`; responsável e status da conversa; badge no menu.
**Sem demanda ainda** — é de propósito: primeiro a equipe usa, depois se
classifica. Uma semana de uso real antes da Fase 2 para ver que motivos
aparecem (a taxonomia acima é hipótese).

### Fase 2 — Demandas + ponte com a fábrica
`demandas` com motivo/submotivo (v2); "Abrir demanda" na conversa; registro
manual (vendedor em Meus Pedidos, telefone, presencial); "Virar reclamação" →
`problemas` com `origem: 'whatsapp'`; alteração → `correcoes` com
`demandaId`; foto obrigatória em qualidade; retrato do pedido congelado;
TPR/TR gravados automaticamente (primeira resposta = primeira mensagem
`de: 'nos'` depois da abertura); SLA congelado na abertura e fila vermelha ao
estourar; fechar exige gravidade + procedência (+ setor causador confirmado
quando o motivo tem setor); resolvido/reaberto.

### Fase 3 — Automáticos (o que reduz o volume)
Avisos "expedido", "saiu para entrega", "entregue", "lembrete de vencimento"
(Financeiro) — no canal não oficial são mensagens comuns (sem template), o que
reforça a regra: **só aviso ligado a um pedido/cobrança real, nunca em massa**.
Disparo pelo backend da VPS ouvindo os eventos que já existem (etapa → `expedido`, `saidaEm`, `entregues`,
`cobrancas.parcelas.vencimento`). Opt-in por cliente (`clientes[].notificar`).
Romaneio para o motorista; canhoto de volta anexado à remessa.

### Fase 4 — Relatórios de atrito e atendimento
Tudo da seção de cruzamentos, em `Relatorios.jsx` › Atendimento e Atrito, com
a mesma régua do relógio da fila (mediana/P85). Chip "cliente de atenção" na
Triagem e no quadro. Motivos editáveis em Cadastros.

### Fase 5 — Bot de consulta + LLM
"Onde está meu pedido 5458?" respondido sozinho fora do horário, com
`responderPergunta`-style por padrões (Opção A, sem custo) e, depois, LLM com
a base do `Localizar` (Opção B, que já estava planejada para a voz — mesmo
backend, mesmo custo). Classificação automática de motivo por LLM como
**sugestão**, nunca gravada sem alguém confirmar (regra da ciência: registro
que ninguém olhou não prova nada).

---

## O que fica de FORA, de propósito
- **Grupos do WhatsApp:** a API oficial não entra em grupo. O grupo da rota
  continua no celular; o que importa (saída, canhoto, retorno) vem por
  conversa individual com o motorista.
- **Chat interno entre funcionários:** não é WhatsApp, e a fábrica já tem o
  quadro e o `problemas` para isso.
- **Disparo em massa / marketing:** outro produto, outro custo, outra regra da
  Meta. Aqui é atendimento.
- **Transcrição de áudio:** Fase 5, se sobrar — áudio do cliente fica como
  mídia; quem atende ouve.

## Riscos e o que fazer com eles
| Risco | Mitigação |
|---|---|
| Backend da VPS cai e o webhook morre em silêncio | Heartbeat + aviso na tela (Fase 0); a Meta reenvia webhook falhado por até 7 dias, então mensagem não se perde, só atrasa |
| Disco da VPS perde as fotos de canhoto | Backup diário do volume para fora da VPS (Fase 0) |
| Equipe continua atendendo no celular pessoal e o sistema fica vazio | Decisão 2 (política + registro manual em 3 toques); o dono cobra pelo relatório de "demandas por pessoa" |
| **Banimento do número principal (canal não oficial)** | Comportamento humano por construção (Decisão 1), chip secundário nas duas primeiras semanas, grupos fora, aviso ao cliente desligado; a Meta fica como troca sem perder histórico |
| Sessão do QR cai (celular desligado/atualizado) | Heartbeat + aviso na tela; `/wa/qr` reconecta; Evolution guarda a sessão no volume `whatsapp_instances` |
| LGPD: conversa tem dado pessoal | Acesso restrito (rules), retenção definida, cliente pode pedir apagar (`contatos.anonimizado`), nada de exportar conversa inteira sem o dono |
| Taxonomia errada | Fase 1 roda uma semana sem classificar; a lista nasce do que apareceu |
| Reclamação vira `problemas` e a fábrica não sabe de onde veio | `origem: 'whatsapp'` + link para a demanda no card da aba Erros |
| Custo de template descontrolado | Só utilidade (não marketing), opt-in por cliente, contador mensal na aba |

## Perguntas em aberto para o dono (levar na próxima conversa)
1. **Chip secundário por duas semanas ou o principal desde o dia 1?** (recomendo o secundário — ver Decisão 1).
2. Quando ligar o aviso automático ao cliente (estrutura fica pronta, desligada).
3. Quais dos outros números (dono, escritório, financeiro) entram depois do principal, e em que ordem.
4. Bater a taxonomia v2 com 10 conversas reais do celular da fábrica da última
   semana — a lista nasceu de raciocínio; a validação é o uso.
5. Ajustar os prazos do SLA (a tabela tem padrões meus).
