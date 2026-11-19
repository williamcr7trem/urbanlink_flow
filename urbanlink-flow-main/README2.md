# UrbanLink Flow

> Plataforma web de logística urbana para solicitar, gerenciar, rastrear e otimizar entregas.

| | |
|---|---|
| 🌐 **Site publicado** | **https://SEU-PROJETO.vercel.app** *(substitua pelo endereço do seu deploy)* |
| 💻 **Repositório GitHub** | **https://github.com/SEU-USUARIO/urbanlink-flow** *(substitua pelo link do seu repositório)* |
| 📖 **Documentação da API** | `https://SEU-PROJETO.vercel.app/api/docs` |
| ❤️ **Verificação do sistema** | `https://SEU-PROJETO.vercel.app/api/health` |

## Descrição do projeto

O **UrbanLink Flow** conecta clientes, motoristas e a equipe gestora em um só sistema. O cliente solicita uma entrega e recebe um código de rastreamento; a gestão atribui motorista e veículo; o motorista atualiza o andamento; e todos acompanham o histórico. O sistema também planeja rotas e simula cenários de trânsito para apoiar decisões de operação.

É uma aplicação com front-end em HTML/CSS/JavaScript, API REST em Node.js/Express e banco de dados relacional MySQL.

## Objetivo do sistema

Organizar e dar transparência à operação de entregas urbanas, permitindo:

- ao **cliente**, pedir entregas e acompanhar cada etapa sem depender de contato manual;
- ao **motorista**, receber e atualizar as entregas atribuídas a ele;
- ao **gestor/administrador**, controlar frota, aprovar motoristas, distribuir entregas e planejar rotas com base em dados;
- à operação como um todo, **estimar tempo e distância** de rotas e comparar cenários de congestionamento.

## Funcionalidades

**Acesso e perfis**
- Cadastro e login com senha criptografada (bcrypt) e sessão JWT.
- Quatro perfis — Administrador, Gestor, Motorista e Cliente — com autorização por perfil e por titularidade do registro.
- Cadastro de motorista com CNH e dados do veículo; operação liberada só após aprovação da gestão.

**Entregas**
- Solicitação de entrega com código único `UL-AAAA-XXXXXX`.
- Ciclo de status controlado: `Pendente → Aguardando coleta → Em trânsito → Saiu para entrega → Entregue`, com `Problema` e `Cancelada`.
- Histórico de eventos (quem mudou o status e quando) e rastreamento por código + e-mail do solicitante.
- Atribuição de motorista e veículo, com liberação automática do veículo ao concluir ou cancelar.
- Busca, paginação e exportação das entregas em CSV.

**Frota e mapa**
- CRUD de veículos e registro de posições (GPS) por motorista.
- Mapa interativo (Leaflet + OpenStreetMap) com entregas, posições e traçado viário (OSRM).

**Rotas e simulação**
- Otimização de paradas pelo vizinho mais próximo, com distância de Haversine.
- Simulação de cenários com fator de congestionamento (1 a 3), tempo-base/tempo simulado e histórico salvo.

**Atendimento e gestão**
- Chamados de suporte com resposta da equipe.
- Painel com indicadores calculados a partir do banco.
- Documentação OpenAPI e testes automatizados.

## Tecnologias utilizadas

| Camada | Tecnologias |
|---|---|
| Front-end | HTML5, CSS3, JavaScript (vanilla), Leaflet, OpenStreetMap, OSRM |
| Back-end | Node.js 20+, Express 5, JWT (`jsonwebtoken`), `bcrypt`, `dotenv` |
| Banco de dados | MySQL 8, Sequelize 6 (ORM), `mysql2` |
| Testes | Test runner nativo do Node.js (`node --test`) |
| Documentação | OpenAPI 3 (`docs/openapi.json`) |
| Hospedagem | Vercel (funções serverless) + MySQL externo |
| Controle de versão | Git e GitHub |

## Modelagem do banco de dados

O banco `urbanlink_flow` tem **8 tabelas**: `usuarios`, `veiculos`, `posicoes_veiculo`, `entregas`, `eventos_entrega`, `rotas`, `chamados` e `simulacoes`.

| Documento | Arquivo |
|---|---|
| Modelagem conceitual | [`docs/modelagem/01_modelo_conceitual.md`](docs/modelagem/01_modelo_conceitual.md) · [imagem](docs/modelagem/01_modelo_conceitual.png) |
| Modelagem lógica | [`docs/modelagem/02_modelo_logico.md`](docs/modelagem/02_modelo_logico.md) |
| DER | [`docs/modelagem/03_DER.png`](docs/modelagem/03_DER.png) · [SVG](docs/modelagem/03_DER.svg) |
| Modelagem física (SQL) | [`adicionais/sql/01_criar_banco_e_tabelas.sql`](adicionais/sql/01_criar_banco_e_tabelas.sql) |

### Diagrama Entidade-Relacionamento

![DER do UrbanLink Flow](docs/modelagem/03_DER.png)

### Modelo conceitual

![Modelo conceitual do UrbanLink Flow](docs/modelagem/01_modelo_conceitual.png)

Resumo dos relacionamentos: um **usuário** (cliente, motorista, gestor ou administrador) pode solicitar/executar várias **entregas**, abrir **chamados**, criar **rotas** e **simulações**; um **motorista** tem no máximo um **veículo**; cada veículo registra várias **posições**; cada entrega gera vários **eventos** de histórico. A ligação de rotas e simulações com entregas é feita por um array JSON (`entrega_ids`), sem chave estrangeira.

## Instalação rápida

Guia completo, com solução de problemas e contas de teste: **[`adicionais/INSTALACAO.md`](adicionais/INSTALACAO.md)**.

```bash
git clone https://github.com/SEU-USUARIO/urbanlink-flow.git
cd urbanlink-flow
npm install
mysql -u root -p < adicionais/sql/01_criar_banco_e_tabelas.sql
mysql -u root -p < adicionais/sql/02_inserir_dados.sql   # dados de demonstração (opcional)
cp .env.example .env     # edite DB_*, JWT_SECRET (24+ caracteres) e ADMIN_INVITE_CODE
npm start                # http://localhost:3000
```

**Contas de demonstração** (após rodar o script 02; senha de todas: `Urban@2026`): `admin@urbanlink.test`, `gestor@urbanlink.test`, `carlos.motorista@urbanlink.test`, `ana.cliente@urbanlink.test`.

## Estrutura do repositório

```text
urbanlink-flow/
├── README.md
├── adicionais/                  # arquivos adicionais da entrega
│   ├── INSTALACAO.md            # configurar, instalar, executar e usar
│   └── sql/
│       ├── 01_criar_banco_e_tabelas.sql
│       └── 02_inserir_dados.sql
├── docs/
│   ├── modelagem/               # conceitual, lógico e DER
│   ├── openapi.json             # contrato da API
│   ├── Guia_Usuario_UrbanLink_Flow.docx
│   └── RELATORIO_CORRECOES.md
├── src/                         # back-end em camadas
│   ├── models/  routes/  controllers/  services/  middlewares/  utils/  config/
│   └── app.js
├── public/                      # front-end publicado (páginas, CSS, JS, imagens)
├── api/index.js                 # entrada serverless (Vercel)
├── tests/                       # testes automatizados
├── vercel.json  VERCEL_DEPLOY.md
├── .env.example  .gitignore
└── package.json
```

> `src/public/` é uma cópia idêntica de `public/`. Em produção o servidor usa `public/`; ao alterar o front-end, mantenha as duas pastas iguais ou remova `src/public/`.

## Regras de negócio

- Dados privados exigem autenticação; cada endpoint valida o perfil e a titularidade do registro.
- E-mail e CPF/CNPJ (quando informado) são únicos; e-mails são normalizados em minúsculas.
- Senhas nunca são armazenadas em texto puro.
- Motorista só recebe entregas e atualiza operações depois de aprovado.
- Só veículos disponíveis podem ser atribuídos; Van e Caminhão exigem peso e volume.
- Transições de status não pulam etapas nem reabrem entregas concluídas/canceladas; cada mudança gera um evento com usuário e data/hora.
- Cliente só vê as próprias entregas; motorista só vê as atribuídas a ele.
- Só Administrador/Gestor gerencia frota, aprova motoristas e atribui entregas; exclusões são restritas ao Administrador.

## API REST — rotas principais

Rotas privadas usam `Authorization: Bearer <token>`. Especificação completa em [`docs/openapi.json`](docs/openapi.json) (`/api/docs`).

| Método | Endpoint | Acesso |
|---|---|---|
| POST | `/api/auth/cadastro` | Público (Administrador exige convite) |
| POST | `/api/auth/login` | Público |
| GET | `/api/auth/me` | Autenticado |
| GET / PATCH | `/api/usuarios/me` | Próprio usuário |
| GET | `/api/usuarios` | Administrador/Gestor |
| POST | `/api/usuarios/gestores` | Administrador |
| PATCH | `/api/usuarios/:id/aprovacao` | Administrador/Gestor |
| GET / POST | `/api/veiculos` | Autenticado / Administrador-Gestor |
| POST | `/api/veiculos/me` | Motorista |
| POST | `/api/veiculos/:id/posicoes` | Administrador/Gestor/Motorista vinculado |
| GET / POST | `/api/entregas` | Autenticado / Cliente-Administrador-Gestor |
| PATCH | `/api/entregas/:id/status` | Titular, motorista atribuído ou equipe |
| PATCH | `/api/entregas/:id/atribuicao` | Administrador/Gestor |
| GET | `/api/rastreamento/:codigo?email=...` | Código + e-mail do solicitante |
| GET | `/api/entregas/exportar.csv` | Administrador/Gestor |
| GET / POST | `/api/rotas`, `/api/rotas/otimizar` | Administrador/Gestor/Motorista aprovado |
| GET / POST | `/api/chamados` | Autenticado |
| GET | `/api/dashboard/resumo` | Autenticado |
| GET / POST / DELETE | `/api/simulacoes`, `/api/simulacoes/:id` | Administrador/Gestor |

## Testes

```bash
npm test
```

Cobrem distância (Haversine), ordenação de paradas, transições de status e cálculo das simulações. Testes completos de API e banco exigem MySQL ativo e podem ser feitos com Postman/Insomnia a partir do OpenAPI.

## Publicação

O deploy é feito na Vercel com um MySQL acessível pela internet. Passo a passo e variáveis de ambiente em [`VERCEL_DEPLOY.md`](VERCEL_DEPLOY.md). Resumo: importe o repositório, importe os scripts SQL no banco remoto, cadastre `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `JWT_SECRET`, `ADMIN_INVITE_CODE` e `DB_SYNC=false`, e faça o deploy.

## Limitações conhecidas

- A otimização de rotas e as simulações são **estimativas matemáticas** (vizinho mais próximo + Haversine + fator de congestionamento), não navegação viária nem trânsito em tempo real.
- O traçado do mapa usa o serviço público OSRM, sujeito a limites e indisponibilidade de terceiros.
- O diretório `uploads/` não é persistente na Vercel; para anexos, use armazenamento externo.
- O atendimento não é chat em tempo real: o usuário atualiza a página para ver a resposta.
- Geolocalização do navegador exige HTTPS e autorização do usuário.

## Licença

ISC.
