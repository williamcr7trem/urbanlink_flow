# UrbanLink Flow — versão integrada e corrigida

Plataforma web de logística urbana com front-end HTML/CSS/JavaScript, API REST em Node.js/Express e persistência MySQL por Sequelize.

## O que foi implementado

- Cadastro e login com senha criptografada por `bcrypt` e sessão JWT.
- Perfis **Administrador**, **Gestor**, **Motorista** e **Cliente**, com autorização por middleware.
- Cadastro de motorista com envio dos dados do veículo e aprovação posterior pela equipe gestora.
- CRUD de veículos, entregas, rotas e chamados de suporte.
- Histórico de eventos de cada entrega e consulta de rastreamento com código + e-mail do solicitante.
- Regras de transição de status, atribuição de motorista/veículo e liberação de veículo após conclusão/cancelamento.
- Paginação, busca, indicadores do painel e exportação CSV das entregas.
- Otimização de paradas por vizinho mais próximo, usando distância geográfica de Haversine.
- Simulação de cenários com fator de congestionamento configurável, cálculo de tempo-base/tempo estimado e histórico persistido.
- Documentação OpenAPI em `docs/openapi.json`, disponível em `/api/docs/openapi.json`.
- Testes unitários para distância, ordenação de paradas e regras de transição de status.

## Requisitos

- Node.js 18 ou superior.
- MySQL 8 (ou versão compatível com Sequelize 6).
- npm.

## Configuração local (Windows / PowerShell)

1. Extraia o ZIP e abra a pasta `urbanlink-flow-main` no VS Code.
2. Instale as dependências:

   ```powershell
   npm install
   ```

3. Crie o banco e as tabelas. É possível executar `database/schema.sql` no MySQL Workbench. Alternativamente, crie somente o banco `urbanlink_flow`; com `DB_SYNC=true`, o Sequelize cria as tabelas ao iniciar.
4. Copie o arquivo de exemplo:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Edite `.env` com os dados do seu MySQL. O padrão deste pacote é `DB_PORT=3306`; se o MySQL estiver configurado em outra porta, informe a porta correta. Defina uma senha JWT longa e um código de convite próprio para o primeiro administrador.
   - `JWT_SECRET`: segredo aleatório exclusivo, com pelo menos 24 caracteres.
   - `ADMIN_INVITE_CODE`: código privado que será solicitado no primeiro cadastro de Administrador.

6. Inicie o servidor:

   ```powershell
   npm start
   ```

7. Acesse `http://localhost:3000`. A API responde em `http://localhost:3000/api/health` e a documentação está em `http://localhost:3000/api/docs`.

> O `.env.example` deixa os segredos vazios de propósito; o servidor não inicia sem `JWT_SECRET`. O arquivo `.env` do ambiente de desenvolvimento não é distribuído. Nunca publique senhas do banco ou segredos JWT no GitHub.

## Primeiro acesso e perfis

- **Administrador:** use a tela "Continuar como Administrador" e o código definido em `ADMIN_INVITE_CODE`. Esse código impede que qualquer visitante crie uma conta administrativa.
- **Cliente:** crie uma conta pela tela inicial. Após o cadastro, a conta já pode solicitar e acompanhar entregas.
- **Motorista:** crie a conta, informe CNH e dados do veículo na segunda etapa. O motorista pode entrar e acompanhar a situação cadastral, mas as ações operacionais ficam bloqueadas até aprovação de um Administrador/Gestor.
- **Gestor:** é criado por um Administrador pela API `POST /api/usuarios/gestores`.

## Fluxo principal de uso

1. Cliente solicita entrega e recebe um código único `UL-AAAA-XXXXXX`.
2. Administrador/Gestor consulta a fila, escolhe motorista aprovado e veículo disponível.
3. Motorista acompanha suas entregas e atualiza a situação conforme o fluxo permitido.
4. O cliente consulta o histórico pelo painel ou pela tela de acompanhamento.
5. O painel apresenta indicadores calculados com base no banco; não há linhas de demonstração gravadas no banco.

## Regras de negócio aplicadas

- Somente usuários autenticados acessam dados privados; cada endpoint valida o perfil e a titularidade do registro.
- E-mails são normalizados para minúsculas e espaços removidos.
- E-mail e CPF/CNPJ (quando informado) são únicos.
- Senhas nunca são armazenadas em texto puro.
- Motoristas precisam ser aprovados antes de receber entregas ou atualizar operações.
- Só veículos disponíveis podem ser atribuídos a novas entregas; veículo ocupado não recebe outra atribuição.
- Quantidade de volumes é um inteiro maior que zero; Van e Caminhão exigem peso e volume.
- Transições de status não podem pular etapas nem reabrir entregas concluídas/canceladas.
- Toda mudança de status registra um evento com usuário e data/hora.
- O cliente só consulta suas próprias entregas; o motorista só consulta entregas atribuídas a ele.
- Só Administrador/Gestor gerencia a frota, aprova motoristas e atribui entregas; exclusão de veículos/entregas é restrita a Administrador.

### Ciclo de status de uma entrega

`Pendente → Aguardando coleta → Em trânsito → Saiu para entrega → Entregue`

Cancelamento é permitido antes da expedição. Uma entrega em operação pode ser marcada como `Problema` e retomada conforme as transições definidas em `src/services/entregaService.js`.

## Rotas principais da API

| Método | Endpoint | Acesso |
|---|---|---|
| POST | `/api/auth/cadastro` | Público, com convite para Administrador |
| POST | `/api/auth/login` | Público |
| GET | `/api/auth/me` | Autenticado |
| GET / PATCH | `/api/usuarios/me` | Próprio usuário |
| GET | `/api/usuarios` | Administrador/Gestor |
| PATCH | `/api/usuarios/:id/aprovacao` | Administrador/Gestor |
| GET / POST | `/api/veiculos` | Autenticado / Administrador-Gestor |
| POST | `/api/veiculos/me` | Motorista |
| POST | `/api/veiculos/:id/posicoes` | Administrador/Gestor/Motorista vinculado |
| GET / POST | `/api/entregas` | Autenticado / Cliente-Administrador-Gestor |
| PATCH | `/api/entregas/:id/status` | Titular, motorista atribuído ou equipe |
| PATCH | `/api/entregas/:id/atribuicao` | Administrador/Gestor |
| GET | `/api/rastreamento/:codigo?email=...` | Código e e-mail do solicitante |
| GET | `/api/entregas/exportar.csv` | Administrador/Gestor |
| GET / POST | `/api/rotas` e `/api/rotas/otimizar` | Administrador/Gestor/Motorista aprovado |
| GET / POST | `/api/chamados` | Autenticado |
| GET | `/api/dashboard/resumo` | Autenticado |
| GET / POST | `/api/simulacoes` | Administrador/Gestor |
| GET / DELETE | `/api/simulacoes/:id` | Administrador/Gestor |

As rotas privadas recebem o cabeçalho `Authorization: Bearer <token>`.

## Simulações: premissas e limites

O módulo de simulação usa as coordenadas cadastradas nas entregas, ordena as paradas pelo vizinho mais próximo e aplica um fator de congestionamento (1 a 3) sobre o tempo-base calculado pela velocidade média. O resultado é salvo para consulta e comparação. Não é uma previsão de tráfego real nem substitui dados de serviços de mapas.

## Planejamento de rotas: limite importante

A otimização atual usa o algoritmo guloso do **vizinho mais próximo** sobre coordenadas informadas/registradas e calcula distâncias com Haversine. Ela fornece uma estimativa geométrica, não uma navegação viária real: não considera trânsito, sentidos de rua, pedágios ou restrições de veículos. Para otimizar, as entregas precisam ter `destino_latitude` e `destino_longitude`, e o ponto inicial deve estar disponível por posição GPS ou ser enviado na chamada. Integração com geocodificação, mapas de ruas ou tráfego em tempo real exige uma chave/serviço externo e não é simulada como se estivesse ativa.

## Testes

Execute:

```powershell
npm test
```

Os testes incluídos cobrem a matemática de distância, a ordenação de paradas, a validação das transições de status e o cálculo matemático do cenário simulado. Para testes completos de API/banco, configure o MySQL local e teste os endpoints autenticados pelo Postman/Insomnia usando os exemplos da documentação OpenAPI.

## Estrutura em camadas

- `src/models`: entidades e relacionamentos Sequelize.
- `src/routes`: endpoints REST.
- `src/controllers`: recebimento/retorno HTTP.
- `src/services`: regras de negócio de entrega e otimização.
- `src/middlewares`: autenticação JWT e autorização por perfil.
- `src/public`: páginas existentes e JavaScript de integração.
- `database/schema.sql`: script de criação física do banco.
- `docs/openapi.json`: documentação contratual da API.

O CSS original (`style.css`, `autenticacao.css` e `dashboard.css`) foi mantido como base do visual; as mudanças de front-end são funcionais, de navegação e de tratamento de mensagens/dados.


## Publicação na Vercel

1. Envie este projeto ao GitHub sem incluir `.env` nem `node_modules`.
2. Importe o repositório na Vercel, mantendo a raiz do projeto como Root Directory.
3. Cadastre na Vercel as variáveis `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `DB_SSL` e `DB_SYNC=false`. Use os dados de um MySQL acessível pela internet; não use `127.0.0.1` na produção.
4. Configure o banco com o schema de `database/schema.sql` antes do primeiro acesso. A sincronização automática fica desativada em produção para evitar alterações concorrentes de estrutura em funções serverless.
5. Faça o deploy. A API é encaminhada para `api/index.js` e os arquivos do site ficam em `public/`.

### Mapa

A tela `mapa-rotas.html` utiliza Leaflet e OpenStreetMap, consulta entregas e posições registradas na API e pode solicitar a localização do navegador (HTTPS obrigatório). O traçado viário usa o serviço público OSRM e pode não estar disponível continuamente. A otimização persistida no banco continua usando o algoritmo do projeto, baseado em coordenadas e distância aproximada.

### Limitações importantes da hospedagem

- O diretório local `uploads/` não é armazenamento persistente em Vercel. Para anexos enviados pelos usuários, configure armazenamento externo (por exemplo, object storage) antes de depender dessa funcionalidade em produção.
- O banco MySQL precisa aceitar conexões da Vercel e, se exigido pelo provedor, usar `DB_SSL=true`.
- Não publique credenciais reais no repositório. Use somente variáveis de ambiente do projeto Vercel.
 **