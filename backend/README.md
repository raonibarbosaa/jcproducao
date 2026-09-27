# backend/ — o servidor da JC Sacolas na VPS

> Por que existe, o desenho e as decisões: [`../WHATSAPP.md`](../WHATSAPP.md).
> Este arquivo é só o **como subir e operar**.

O site continua no GitHub Pages. Este backend roda na VPS `totali` (a mesma da
Agência 100K), atrás do Traefik, como stack do Portainer a partir deste
repositório. Ele:

1. recebe os eventos da **Evolution API** (WhatsApp por QR code) e grava
   `conversas`, `mensagens` e `contatos` no Firestore com o Admin SDK;
2. ouve a fila `enviar/` e manda as mensagens (texto, mídia, áudio);
3. guarda as mídias recebidas no volume `midia` e as serve por URL assinada;
4. carimba `config/backend.vivoEm` a cada minuto (a tela avisa quando some).

## Subir pela primeira vez (Raoni, ~30 min)

1. **DNS (Totali):** registro A `api.jcproducao` → `201.54.20.97`.
2. **Conta de serviço do Firebase:** console › projeto `producaojcsacolas` ›
   ⚙ Configurações › *Contas de serviço* › *Gerar nova chave privada* (JSON).
   No Mac: `base64 -i <arquivo>.json | tr -d '\n' | pbcopy` — é o valor de
   `FIREBASE_SERVICE_ACCOUNT_B64`. Apagar o JSON depois.
3. **Segredos:** `openssl rand -hex 24` quatro vezes, para `POSTGRES_PASSWORD`,
   `WA_API_KEY`, `WA_WEBHOOK_TOKEN` e `MIDIA_SEGREDO`; mais um curto para
   `WA_ADMIN_CHAVE`. Preencher num `.env` LOCAL a partir de `.env.example`
   (não versionar).
4. **Portainer** (`portainer.totalicontabilidade.com.br`) › Stacks › *Add stack*
   › *Repository*:
   | Campo | Valor |
   |---|---|
   | Name | `jcproducao` (**exatamente**) |
   | Repository URL | `https://github.com/raonibarbosaa/jcproducao` |
   | Reference | `refs/heads/main` |
   | Compose path | `backend/docker-compose.yml` |
   | Additional files | `backend/docker-compose.traefik.yml` |
   | Environment variables | *Load variables from .env file* com o `.env` do passo 3 |
   O primeiro build leva 2 a 4 min.
5. **Parear o celular:** abrir
   `https://api.jcproducao.totalicontabilidade.com.br/wa/qr?chave=<WA_ADMIN_CHAVE>`
   e, no celular do número, WhatsApp › Aparelhos conectados › Conectar aparelho.
   A página diz "Conectado" quando termina.
6. **Prova:** mandar "oi" para o número de outro celular e conferir no Firestore
   `conversas/<telefone>/mensagens`. Criar um doc em `enviar/` com
   `{telefone, texto, porNome: 'Teste', status: 'pendente'}` e receber no celular.
7. **Backup:** incluir `/var/lib/docker/volumes/jcproducao_midia/_data` e
   `jcproducao_whatsapp_instances` na rotina de backup da VPS.

## Publicar uma mudança
Merge em `main` → Portainer › Stacks › jcproducao › *Pull and redeploy*.
(O deploy do site continua igual, pelo `gh-pages`; são independentes.)

## Rules do Firestore
As coleções novas (`contatos`, `conversas`, `enviar`, `demandas`) estão em
`../firestore.rules`. **Publicar ANTES do build do site**, como sempre:
`npx firebase deploy --only firestore:rules`. O backend não depende das rules
(Admin SDK), mas a tela sim.

## Operação
- `https://api…/saude` responde `{ok:true}`; o Traefik e o Docker usam.
- Número caiu (celular desligou, sessão expirou): `/wa/qr?chave=…` de novo.
- Logs: Portainer › Containers › `jcproducao-backend-1` › Logs.
- **Nunca `docker compose up` à mão em produção**: o Portainer é quem publica
  (mesma regra da Agência 100K, e pelo mesmo motivo — o `.env` da pasta não é o
  da stack).

## Variáveis
Ver `.env.example`. Sem `WA_API_KEY`, `WA_WEBHOOK_TOKEN`,
`FIREBASE_SERVICE_ACCOUNT_B64` ou `MIDIA_SEGREDO` o backend **não sobe** e diz
qual falta — melhor do que subir e perder mensagem em silêncio.
