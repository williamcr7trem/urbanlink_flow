# Relatório de revisão e correções — UrbanLink Flow

## Base utilizada

A revisão considerou o site enviado no arquivo `urbanlink-flow-main.zip`, os materiais do ZIP `Modulos Teste.zip` e o Plano de Situação de Aprendizagem do projeto UrbanLink Flow.

O plano exige uma aplicação web responsiva, API REST, operações CRUD, banco de dados relacional integrado, regras de negócio de logística, integração HTTP, documentação e testes. Os módulos foram usados como referência para organização em camadas, autenticação/autorização, requisitos, integração front-end/back-end, tratamento de respostas HTTP e testes.

## Principais problemas encontrados e tratados

### Estrutura e inicialização
- Imports de modelos com nomes/capitalização inconsistentes com os arquivos reais.
- Serviço de rotas com caracteres de quebra de linha inválidos, impedindo a leitura do JavaScript.
- Inicialização do servidor que não aguardava a conexão com o banco e a sincronização dos modelos.
- Ausência de hospedagem das páginas do site pelo próprio servidor Express.
- Arquivo de dependências com metadados divergentes do `package.json`, agora alinhado.

### Back-end e regras de negócio
- Criada API REST organizada em rotas, controllers, services, models, middlewares e configuração.
- Implementados cadastro, login, JWT, senha com hash bcrypt e autorização por perfil.
- Implementados CRUDs e operações de gestão para usuários, veículos, entregas, rotas, chamados e simulações.
- Restringido o acesso do cliente às próprias entregas e do motorista às entregas e ao veículo vinculados a ele.
- Implementado fluxo permitido de status de entrega, com histórico de eventos.
- Implementadas validações para aprovação de motorista, atribuição de veículo, tipo de veículo e capacidade da carga.
- Adicionadas validações de coordenadas para impedir a geração de rotas com localização ausente ou inválida.
- Persistidos os resultados de simulações de cenário.
- Adicionado script SQL com chaves primárias, estrangeiras e índices.

### Front-end e integração
- Conectados formulários de cadastro, login, solicitação, rastreamento e suporte à API.
- Integrados painéis e telas operacionais aos dados retornados pelo banco.
- Corrigidos destinos de links e nomes de páginas inconsistentes.
- Substituídas referências de imagens inexistentes por recursos SVG locais.
- Removidos exemplos de código de rastreamento e endereços fictícios das telas.
- Incluídos avisos de carregamento, sucesso e erro, além de controle de sessão e redirecionamento por perfil.
- Mantidos os arquivos CSS originais (`style.css`, `autenticacao.css` e `dashboard.css`) como base; o arquivo `funcionalidades.css` acrescenta estilos para estados e mensagens, sem redesenhar a identidade visual.

## Verificações executadas

- Verificação de sintaxe com `node --check` nos 37 arquivos JavaScript: sem erros.
- Testes automatizados: 7 passaram, 0 falharam.
- Auditoria das 19 páginas HTML: nenhuma referência local quebrada e nenhum ID duplicado.
- Validação sintática do JSON OpenAPI.
- Verificação do conteúdo do ZIP após sua geração.

## Configuração necessária antes de executar

O ambiente usado para a revisão não possui um MySQL local configurado nem as dependências instaladas para subir a aplicação completa. Por isso, os testes de lógica e as verificações estáticas foram executados, mas não foi possível validar uma sessão real de navegador/API conectada a um banco ativo.

No computador de execução:
1. Instale Node.js 18 ou superior e MySQL.
2. Execute `npm install` na pasta do projeto.
3. Copie `.env.example` para `.env` e preencha os dados do MySQL.
4. Defina `JWT_SECRET` com pelo menos 24 caracteres e um `ADMIN_INVITE_CODE` privado.
5. Crie o banco `urbanlink_flow` e importe `database/schema.sql`, ou crie o banco e mantenha `DB_SYNC=true`.
6. Execute `npm start` e abra `http://localhost:3000`.

A documentação da API ficará disponível em `http://localhost:3000/api/docs`.

## Limites funcionais conhecidos

O otimizador usa distância geográfica Haversine e o algoritmo do vizinho mais próximo, com coordenadas cadastradas ou informadas. A simulação aplica um fator de congestionamento ao tempo estimado. Esses cálculos são estimativas matemáticas: não representam trânsito em tempo real, navegação por ruas, restrições viárias ou geocodificação. Para esses recursos, será necessário configurar um provedor de mapas/tráfego e sua chave de API.

## Revisão funcional complementar — novembro de 2026

Foram feitas correções adicionais mantendo o layout e as folhas de estilo existentes:
- Corrigida a leitura do campo de rastreamento na página inicial do cliente.
- Tratada a ausência de entregas ativas no cartão de próxima entrega, sem tentar acessar campos de um pedido inexistente.
- Ajustados os links de acompanhamento para abrir a última entrega ou orientar o cliente a criar a primeira.
- Corrigida a duplicação dos campos de latitude/longitude no formulário do cliente e mantida a validação para preencher os dois campos em conjunto.
- Habilitados os botões de ligação e mensagem da página de acompanhamento conforme os dados existentes; o botão de mensagem leva ao formulário de atendimento com o código da entrega preenchido.
- O atendimento apresenta chamados salvos no banco; o administrador pode responder e o usuário consulta a resposta atualizando a página. Não é chat em tempo real.
- Tornadas operacionais as perguntas frequentes, os botões de proposta e contato da página de patrocinadores, com indicação explícita quando recursos externos não estão configurados.
- Corrigida a interpretação de coordenadas vazias no mapa e incluído o compartilhamento pontual da posição pelo motorista mediante autorização do navegador.
- Ajustado o seletor de status da gestão para mostrar somente transições aceitas pelas regras de negócio.
- Corrigido o texto visível da opção de veículo Van.

### Verificações desta revisão
- `node --check` executado em todos os arquivos JavaScript do projeto: sem erros de sintaxe.
- `npm test`: 7 testes aprovados, 0 falhas.
- Auditoria estática das 19 páginas HTML: sem IDs duplicados e sem arquivos locais referenciados ausentes.
- Pastas `public` e `src/public` conferidas e sincronizadas.

### Escopo de testes não executado
Não foi feito teste de ponta a ponta no navegador conectado a um banco MySQL ativo. Portanto, os testes acima comprovam sintaxe, referências estáticas e regras matemáticas/estados cobertas pela suíte existente, mas não substituem a validação local dos fluxos de cadastro, login, banco e operações com dados reais.
