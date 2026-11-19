(() => {
  'use strict';

  const API = '/api';
  const TOKEN_KEY = 'urbanlink_token';
  const USER_KEY = 'urbanlink_usuario';
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  function token() { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ''; }
  function storedUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  }
  function saveSession(payload, remember) {
    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    store.setItem(TOKEN_KEY, payload.token);
    store.setItem(USER_KEY, JSON.stringify(payload.usuario));
    other.removeItem(TOKEN_KEY);
    other.removeItem(USER_KEY);
  }
  function clearSession() {
    [localStorage, sessionStorage].forEach(s => { s.removeItem(TOKEN_KEY); s.removeItem(USER_KEY); });
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (token() && options.auth !== false) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
    });
    const type = response.headers.get('content-type') || '';
    const result = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = result && result.mensagem ? result.mensagem : `Não foi possível concluir a solicitação (${response.status}).`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function message(text, kind = 'info', target) {
    const node = document.createElement('div');
    node.className = `mensagem-app ${kind}`;
    node.setAttribute('role', kind === 'erro' ? 'alert' : 'status');
    node.textContent = text;
    const host = target || $('main') || $('form') || document.body;
    host.prepend(node);
    return node;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function safeDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
  }
  function val(id) { return $(`#${id}`)?.value?.trim() || ''; }
  function num(id) {
    const v = val(id);
    return v === '' ? null : Number(v);
  }
  function statusBadge(status) {
    const badge = el('span', 'badge-status', status || '—');
    badge.dataset.status = status || '';
    return badge;
  }
  function gotoProfile(profile) {
    const map = { Cliente: 'inicial-cliente.html', Motorista: 'inicial-motorista.html', Administrador: 'inicial-admin.html', Gestor: 'inicial-admin.html' };
    window.location.href = map[profile] || 'index.html';
  }
  function isManager(profile) { return profile === 'Administrador' || profile === 'Gestor'; }

  async function protectPage() {
    const page = document.body.dataset.page || '';
    const required = (document.body.dataset.role || '').split(',').filter(Boolean);
    if (!required.length) return null;
    if (!token()) {
      window.location.replace(page.includes('dashboard') || page.includes('delivery') || page.includes('support') || page.includes('route') || page === 'tracking'
        ? (required[0] === 'Motorista' ? 'login-motorista.html' : required[0] === 'Administrador' ? 'login-adm.html' : 'login.html')
        : 'index.html');
      return null;
    }
    try {
      const data = await request('/auth/me');
      const user = data.usuario;
      if (!required.includes(user.perfil) && !(required.includes('Administrador') && user.perfil === 'Gestor')) {
        message('Seu perfil não tem permissão para acessar esta tela. Você será direcionado ao painel correto.', 'erro');
        setTimeout(() => gotoProfile(user.perfil), 1200);
        return null;
      }
      if (user.perfil === 'Motorista' && user.aprovado === false &&
          !['vehicle-registration', 'driver-dashboard', 'support'].includes(page)) {
        message('Seu cadastro de motorista ainda aguarda aprovação do gestor.', 'info');
        setTimeout(() => gotoProfile(user.perfil), 1200);
        return null;
      }
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      $$('.perfil-usuario span').forEach(s => { s.textContent = `Bem-vindo(a), ${user.nome}`; });
      adjustNavigation(user);
      return user;
    } catch (error) {
      clearSession();
      if (error.status === 401) {
        window.location.replace('login.html');
        return null;
      }
      message(error.message, 'erro');
      return null;
    }
  }


  function adjustNavigation(user) {
    if (!user) return;
    const manager = isManager(user.perfil);
    const home = manager ? 'inicial-admin.html' : user.perfil === 'Motorista' ? 'inicial-motorista.html' : 'inicial-cliente.html';
    const delivery = manager ? 'entrega-motorista.html' : 'entrega-cliente.html';
    const support = user.perfil === 'Motorista' ? 'atendimento-motorista.html' : 'atendimento-cliente.html';
    $$('.navegacao-topo a').forEach(link => {
      const label=link.textContent.trim().toLowerCase();
      if (label==='início' || label==='inicio') link.href=home;
      else if (label==='gestão de entregas') link.href='entrega-motorista.html';
      else if (label==='mapa e rotas') link.href='mapa-rotas.html';
      else if (label==='atendimento') link.href=support;
      else if (label==='acompanhamento') link.href='acompanhamento.html';
      else if (label==='simulações') link.href='simulacoes.html';
      else if (label==='patrocinadores') link.href='patrocinadores.html';
    });
    $$('a[href="inicial-motorista.html"]').forEach(link=>{
      if(manager && link.closest('.navegacao-topo'))link.href=home;
    });
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function loginPage() {
    const form = $('#form-login');
    if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const expected = document.body.dataset.role || 'Cliente';
      if (!val('email-login') || !val('senha-login')) return message('Informe e-mail e senha.', 'erro', form);
      const button = $('button[type="submit"]', form);
      if (button) button.disabled = true;
      try {
        const result = await request('/auth/login', {
          method: 'POST',
          auth: false,
          body: { email: val('email-login'), senha: val('senha-login'), perfil: expected }
        });
        saveSession(result, $('#lembrar')?.checked === true);
        gotoProfile(result.usuario.perfil);
      } catch (error) {
        message(error.message, 'erro', form);
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  async function cadastroPage() {
    const form = $('#form-cadastro');
    if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const password = val('senha'), confirmation = val('confirmar-senha');
      if (password !== confirmation) return message('As senhas informadas não coincidem.', 'erro', form);
      if (!$('#termos')?.checked) return message('É necessário aceitar os termos para continuar.', 'erro', form);
      const profile = document.body.dataset.role || 'Cliente';
      const cpf = val('cpf') || val('cpf-cnpj');
      const cnpj = val('cnpj');
      const body = {
        nome: val('nome'),
        email: val('email'),
        senha: password,
        perfil: profile,
        cpf_cnpj: cpf || cnpj,
        telefone: val('celular'),
        cep: val('cep'),
        cnh: val('cnh'),
        codigo_convite: val('codigo-convite')
      };
      const button = $('button[type="submit"]', form);
      if (button) button.disabled = true;
      try {
        const result = await request('/auth/cadastro', { method: 'POST', auth: false, body });
        saveSession(result, true);
        if (profile === 'Motorista') window.location.href = 'info-motorista.html';
        else gotoProfile(result.usuario.perfil);
      } catch (error) {
        message(error.message, 'erro', form);
      } finally { if (button) button.disabled = false; }
    });
  }

  async function vehicleRegistrationPage(user) {
    const form = $('#form-veiculo');
    if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const file = $('#upload-cnh')?.files?.[0];
      if (!file) return message('Anexe uma imagem ou PDF da CNH para análise do gestor.', 'erro', form);
      if (file && file.size > 1024 * 1024) return message('A imagem/PDF da CNH deve ter até 1 MB.', 'erro', form);
      const type = val('tipo-veiculo');
      if (!['Moto','Carro','Van','Caminhão','Elétrico'].includes(type)) return message('Tipo de veículo inválido. Use Moto, Carro, Van, Caminhão ou Elétrico.', 'erro', form);
      const capacity = num('capacidade');
      let documento = null;
      if (file) {
        documento = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Não foi possível ler o arquivo da CNH.'));
          reader.readAsDataURL(file);
        }).catch(error => { message(error.message, 'erro', form); return null; });
        if (!documento) return;
      }
      const body = {
        modelo: val('modelo'), placa: val('placa'), cor: val('cor'), ano: num('ano'),
        tipo, capacidade_kg: capacity ?? 0, capacidade_tanque_l: num('tanque'), volume_m3: num('volume-m3')
      };
      try {
        const result = await request('/veiculos/me', { method: 'POST', body });
        if (documento) await request('/usuarios/me', { method: 'PATCH', body: { documento_cnh: documento } });
        message(result.mensagem || 'Veículo cadastrado.', 'sucesso', form);
        setTimeout(() => { window.location.href = 'inicial-motorista.html'; }, 1100);
      } catch (error) { message(error.message, 'erro', form); }
    });
  }

  async function carregarPerfil() {
    try {
      const { usuario } = await request('/usuarios/me');
      $$('.perfil-usuario span').forEach(s => { s.textContent = `Bem-vindo(a), ${usuario.nome}`; });
      return usuario;
    } catch { return storedUser(); }
  }

  async function carregarDashboardCliente() {
    const [summary, deliveries] = await Promise.all([request('/dashboard/resumo'), request('/entregas')]);
    const rows = deliveries.dados || [];
    const metricCards = $$('.cartao-info');
    if (metricCards[0]) {
      const p = $('.numero-cartao', metricCards[0]) || $('.numero-metrica', metricCards[0]);
      if (p) p.textContent = String(summary.em_andamento);
    }
    if (metricCards[1]) {
      const p = $('.numero-cartao', metricCards[1]) || $('.numero-metrica', metricCards[1]);
      if (p) p.textContent = String(summary.entregues);
    }
    const tbody = $('.tabela-pedidos tbody');
    if (tbody) {
      tbody.replaceChildren();
      rows.slice(0, 8).forEach(item => {
        const tr = document.createElement('tr');
        [item.codigo, item.destinatario_nome, item.destino].forEach(value => tr.append(el('td','',value)));
        const statusCell = el('td'); statusCell.append(statusBadge(item.status)); tr.append(statusCell);
        const actionCell = el('td');
        const link = el('a','link-acao','Acompanhar');
        link.href = `acompanhamento.html?codigo=${encodeURIComponent(item.codigo)}`;
        actionCell.append(link); tr.append(actionCell);
        tbody.append(tr);
      });
      if (!rows.length) {
        const tr = el('tr'); const td = el('td','estado-vazio','Você ainda não tem entregas cadastradas.');
        td.colSpan = 5; tr.append(td); tbody.append(tr);
      }
    }
    const next = rows.find(item => !['Entregue','Cancelada'].includes(item.status));
    const nextCard = $('.cartao-proxima-entrega');
    if (nextCard) {
      const heading = $('.destaque-hora', nextCard);
      const sub = $('.subtexto-cartao', nextCard);
      const code = $('.codigo-rota', nextCard);
      const badge = $('.cabecalho-rota .badge', nextCard);
      const driver = $('.nome-motorista', nextCard);
      const vehicle = $('.veiculo-motorista', nextCard);
      const details = $('.detalhes-em-rota h3', nextCard);
      const progress = $('.progresso-preenchido', nextCard);
      const track = $('#cliente-ver-rastreamento');
      if (next) {
        if (heading) heading.textContent = next.janela_fim ? `Até ${next.janela_fim}` : next.status;
        if (sub) sub.textContent = `Pedido ${next.codigo}`;
        if (code) code.textContent = next.codigo;
        if (badge) { badge.textContent = next.status; badge.dataset.status = next.status; }
        if (driver) driver.textContent = next.motorista?.nome || 'Motorista ainda não atribuído';
        if (vehicle) vehicle.textContent = next.veiculo ? `${next.veiculo.tipo} • ${next.veiculo.placa}` : 'Veículo não atribuído';
        if (details) details.textContent = next.destino;
        if (progress) progress.style.width = next.status === 'Entregue' ? '100%' : '0%';
        if (track) {
          track.disabled = false;
          track.onclick = () => { window.location.href = `acompanhamento.html?codigo=${encodeURIComponent(next.codigo)}`; };
        }
      } else {
        if (heading) heading.textContent = 'Nenhuma entrega ativa';
        if (sub) sub.textContent = 'Crie uma nova solicitação para acompanhar uma entrega.';
        if (code) code.textContent = '—';
        if (badge) { badge.textContent = 'Sem entrega ativa'; badge.dataset.status = ''; }
        if (driver) driver.textContent = 'Não atribuído';
        if (vehicle) vehicle.textContent = 'Não atribuído';
        if (details) details.textContent = 'Aguardando nova solicitação';
        if (progress) progress.style.width = '0%';
        if (track) track.disabled = true;
      }
    }
    const supportButton = $('[data-action="suporte"]');
    if (supportButton) supportButton.addEventListener('click', () => window.location.href = 'atendimento-cliente.html');
    const searchForm = $('#form-rastreio-painel');
    if (searchForm) searchForm.addEventListener('submit', e => {
      e.preventDefault();
      const code = val('codigo-rastreio-painel');
      if (code) window.location.href = `acompanhamento.html?codigo=${encodeURIComponent(code)}`;
    });
    const latestLink = $('.link-ver-todos');
    if (latestLink) {
      if (rows[0]) {
        latestLink.href = `acompanhamento.html?codigo=${encodeURIComponent(rows[0].codigo)}`;
        latestLink.textContent = 'Acompanhar última entrega →';
      } else {
        latestLink.href = 'entrega-cliente.html';
        latestLink.textContent = 'Criar sua primeira entrega →';
      }
    }
  }

  async function customerDeliveryPage(user) {
    const form = $('#form-nova-entrega');
    if (!form) return;
    const vehicleButtons = $$('.botao-seletor', form);
    let chosenVehicle = $('.botao-seletor.ativo', form)?.dataset.veiculo || 'Moto';
    vehicleButtons.forEach(button => {
      button.addEventListener('click', () => {
        vehicleButtons.forEach(b => b.classList.toggle('ativo', b === button));
        chosenVehicle = button.dataset.veiculo || button.textContent.trim();
      });
    });
    const radios = $$('input[name="coleta"]', form);
    const otherOrigin = $('#coleta-outro-campo');
    radios.forEach(radio => radio.addEventListener('change', () => {
      if (otherOrigin) otherOrigin.hidden = !($('#coleta-outro')?.checked);
    }));
    $('#coleta-outro-campo')?.querySelector('input')?.addEventListener('input', e => {
      e.target.required = $('#coleta-outro')?.checked === true;
    });
    const profile = user || await carregarPerfil();
    const defaultPickup = profile?.endereco_coleta || 'Centro de distribuição';
    const summary = $('.area-resumo');
    const pickupText = $('.opcoes-radio .caixa-radio:first-child p');
    if (pickupText) pickupText.textContent = defaultPickup;
    const summaryLines = summary ? $$('.item-resumo p', summary) : [];
    if (summaryLines[0]) summaryLines[0].textContent = defaultPickup;
    if (summaryLines[1]) summaryLines[1].textContent = 'Endereço de entrega';
    if (summaryLines[2]) summaryLines[2].textContent = chosenVehicle;
    vehicleButtons.forEach(button => button.addEventListener('click', () => {
      if (summaryLines[2]) summaryLines[2].textContent = chosenVehicle;
    }));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const other = $('#coleta-outro')?.checked === true;
      const origin = other ? val('origem') : defaultPickup;
      const body = {
        origem: origin,
        destinatario_nome: val('destinatario_nome') || profile?.nome,
        destinatario_telefone: val('destinatario_telefone'),
        cep_entrega: val('cep_entrega'),
        destino: val('destino'),
        bairro: val('bairro'),
        cidade: val('cidade'),
        tipo_veiculo: chosenVehicle,
        tipo_carga: val('tipo-carga'),
        quantidade_volumes: num('quantidade-volumes') || 1,
        peso_kg: num('peso-kg'),
        volume_m3: num('volume-m3'),
        destino_latitude: num('destino-latitude'),
        destino_longitude: num('destino-longitude')
      };
      try {
        if ((body.destino_latitude === null) !== (body.destino_longitude === null)) {
          throw new Error('Preencha latitude e longitude juntas ou deixe os dois campos vazios.');
        }
        const result = await request('/entregas', { method: 'POST', body });
        const mapNote = body.destino_latitude !== null && body.destino_longitude !== null
          ? ' O destino também foi registrado para o mapa.'
          : ' Para incluir o destino no mapa e calcular rotas, informe as coordenadas opcionais.';
        message(`${result.mensagem} Código: ${result.entrega.codigo}.${mapNote}`, 'sucesso', form);
        setTimeout(() => window.location.href = `acompanhamento.html?codigo=${encodeURIComponent(result.entrega.codigo)}`, 1800);
      } catch (error) { message(error.message, 'erro', form); }
    });
    $('[data-action="cancelar"]',form)?.addEventListener('click', () => { window.location.href='inicial-cliente.html'; });
    if (summary) {
      const p = $('.item-resumo p',summary);
      if (p) p.textContent = defaultPickup;
    }
  }

  function renderTimeline(delivery) {
    const host = $('#eventos-rastreamento') || $('.lista-eventos') || $('.corpo-rastreamento');
    if (!host) return;
    host.replaceChildren();
    const events = delivery.eventos || [];
    if (!events.length) {
      const p = el('p','estado-vazio','Ainda não há atualizações registradas.');
      host.append(p); return;
    }
    const list = el('ul','lista-eventos');
    events.forEach(event => {
      const li = document.createElement('li');
      li.append(el('strong','',event.status), el('div','',event.descricao), el('small','',safeDate(event.createdAt)));
      list.append(li);
    });
    host.append(list);
  }

  async function trackingPage(user) {
    const form = $('#form-rastreamento');
    const input = $('#codigo-rastreamento');
    const query = new URLSearchParams(window.location.search).get('codigo');
    if (query && input) input.value = query;
    const render = async code => {
      if (!code) throw new Error('Informe o código da entrega.');
      const email = user?.email || storedUser()?.email;
      if (!email) throw new Error('Não foi possível identificar o e-mail da conta.');
      const { entrega } = await request(`/rastreamento/${encodeURIComponent(code)}?email=${encodeURIComponent(email)}`, { auth: false });
      renderTimeline(entrega);
      const statusCard = $('.cartao-status-escuro');
      if (statusCard) {
        const title = $('p', statusCard); if (title) title.textContent = 'Status da entrega';
        const value = $('h2', statusCard); if (value) value.textContent = entrega.status;
        const note = $('.rodape-progresso', statusCard);
        if (note) note.textContent = `Código ${entrega.codigo} • atualizado em ${safeDate(entrega.updatedAt)}`;
        const fill = $('.preenchimento', statusCard);
        const progress = { Pendente: 5, 'Aguardando coleta': 20, 'Em trânsito': 50, 'Saiu para entrega': 80, Entregue: 100, Problema: 50, Cancelada: 0 };
        if (fill) fill.style.width = `${progress[entrega.status] ?? 0}%`;
      }
      const balloon = $('.balao-flutuante');
      if (balloon) { const strong = $('strong', balloon); if (strong) strong.textContent = entrega.status; }
      const detailValues = $$('.item-detalhe p');
      if (detailValues[0]) detailValues[0].textContent = entrega.destino || '—';
      if (detailValues[1]) detailValues[1].textContent = entrega.destinatario_nome || '—';
      if (detailValues[2]) detailValues[2].textContent = `${entrega.quantidade_volumes} volume(s) • ${entrega.tipo_carga || 'Carga geral'}`;
      const driverName = $('.cartao-info-lateral .nome-motorista');
      if (driverName) driverName.textContent = entrega.motorista?.nome || 'Motorista não atribuído';
      const vehicleName = $('.cartao-info-lateral .veiculo-motorista');
      if (vehicleName) vehicleName.textContent = entrega.veiculo ? `${entrega.veiculo.tipo} • ${entrega.veiculo.placa}` : 'Veículo não atribuído';
      const callButton = $('#rastrear-ligar');
      const messageButton = $('#rastrear-mensagem');
      if (callButton) {
        const phone = String(entrega.motorista?.telefone || '').replace(/[^0-9+]/g, '');
        callButton.disabled = !phone;
        callButton.title = phone ? 'Ligar para o motorista' : 'O motorista ainda não possui telefone cadastrado ou não foi atribuído.';
        callButton.onclick = () => { if (phone) window.location.href = `tel:${phone}`; };
      }
      if (messageButton) {
        messageButton.disabled = false;
        messageButton.onclick = () => {
          const assunto = `Ajuda com a entrega ${entrega.codigo}`;
          const texto = `Olá, preciso de ajuda com a entrega ${entrega.codigo}. Status atual: ${entrega.status}.`;
          window.location.href = `atendimento-cliente.html?codigo=${encodeURIComponent(entrega.codigo)}&assunto=${encodeURIComponent(assunto)}&mensagem=${encodeURIComponent(texto)}`;
        };
      }
      const headings = $$('h2');
      headings.forEach(h => {
        if (/0,0 km|restantes/i.test(h.textContent)) h.textContent = entrega.destino;
      });
      const address = $('.endereco-parada');
      if (address) address.textContent = entrega.destino;
      message(`Entrega ${entrega.codigo}: ${entrega.status}. Última atualização: ${safeDate(entrega.updatedAt)}.`, 'sucesso');
    };
    if (form) form.addEventListener('submit', async e => {
      e.preventDefault();
      try { await render(input?.value.trim()); }
      catch (error) { message(error.message, 'erro'); }
    });
    if (query) {
      try { await render(query); } catch (error) { message(error.message,'erro'); }
    }
  }

  async function carregarAdmin() {
    const [summary, deliveries, users, tickets] = await Promise.all([
      request('/dashboard/resumo'),
      request('/entregas?limite=100'),
      request('/usuarios?perfil=Motorista&aprovado=false&limite=100'),
      request('/chamados')
    ]);
    const cards = $$('.cartao-metricas, .cartao-info');
    const values = [summary.total, summary.em_andamento, summary.entregues, summary.motoristas_pendentes ?? summary.veiculos_disponiveis ?? 0];
    const valuesPainel = [summary.total, summary.em_andamento, summary.entregues,
      summary.veiculos_disponiveis ?? 0];
    cards.slice(0,4).forEach((card,i) => {
      const target = $('.numero-metrica',card) || $('strong',card) || $('p',card);
      if (target) target.textContent = String(valuesPainel[i] ?? 0);
    });
    const tbody = $('.tabela-pedidos tbody');
    if (tbody) {
      tbody.replaceChildren();
      (deliveries.dados || []).slice(0,10).forEach(d => {
        const tr=el('tr');
        [d.codigo,d.cliente?.nome || '—',d.destino,d.motorista?.nome || 'Sem motorista'].forEach(v=>tr.append(el('td','',v)));
        const status=el('td');status.append(statusBadge(d.status));tr.append(status);
        tbody.append(tr);
      });
      if (!(deliveries.dados||[]).length) {
        const tr=el('tr');const td=el('td','estado-vazio','Nenhuma entrega cadastrada.');td.colSpan=5;tr.append(td);tbody.append(tr);
      }
    }
    const pending = $('#lista-motoristas-pendentes');
    const pendingData = users.dados || [];
    if (pending) {
      let container = $('#motoristas-pendentes-itens',pending);
      if (!container) { container=el('div'); container.id='motoristas-pendentes-itens'; pending.append(container); }
      container.replaceChildren();
      if (!pendingData.length) container.append(el('p','estado-vazio','Não há motoristas aguardando aprovação.'));
      pendingData.forEach(driver => {
        const line=el('div','motorista-pendente');
        const detail=el('div');detail.append(el('strong','',driver.nome),el('div','texto-secundario',`${driver.email} • CNH: ${driver.cnh || 'não informada'}`));
        const buttons=el('div','acoes-tabela');
        const documentButton=el('button','botao botao-secundario-pequeno','Ver CNH');documentButton.type='button';
        documentButton.addEventListener('click',async()=>{
          const tab=window.open('about:blank','_blank');
          try{
            const result=await request(`/usuarios/${driver.id}`);
            if(!result.usuario.documento_cnh){if(tab)tab.close();message('Este motorista ainda não anexou o documento da CNH.','erro');return;}
            if(tab)tab.location.href=result.usuario.documento_cnh;
            else message('O navegador bloqueou a nova aba. Permita pop-ups para abrir a CNH.','info');
          }catch(e){if(tab)tab.close();message(e.message,'erro');}
        });
        const button=el('button','botao botao-primario','Aprovar');button.type='button';
        button.addEventListener('click',async()=>{
          try{await request(`/usuarios/${driver.id}/aprovacao`,{method:'PATCH',body:{aprovado:true}});line.remove();message(`Motorista ${driver.nome} aprovado.`,'sucesso');}
          catch(e){message(e.message,'erro');}
        });
        buttons.append(documentButton,button);
        line.append(detail,buttons);container.append(line);
      });
    }
    renderAdminTickets(tickets.dados || []);
    const dateNode=$('#data-painel-admin');
    if(dateNode) dateNode.textContent=`Resumo operacional • ${new Date().toLocaleDateString('pt-BR')}`;
    const totalNode=$('.info-resumo-estoque p');
    if(totalNode) totalNode.textContent=String(summary.total);
    const search=$('#admin-filtro-entregas');
    const filterRows=()=>{
      const query=(search?.value||'').toLowerCase();
      $$('#admin-entregas-recentes tr').forEach(row=>row.hidden=query!==''&&!row.textContent.toLowerCase().includes(query));
    };
    search?.addEventListener('input',filterRows);
    $('#admin-aplicar-filtro')?.addEventListener('click',filterRows);
    const exportBtn=$('#exportar-csv-admin');
    if(exportBtn) exportBtn.addEventListener('click',exportCsv);
  }

  function renderAdminTickets(tickets) {
    const host=$('#lista-chamados-admin');
    if(!host)return;
    host.replaceChildren();
    if(!tickets.length){host.append(el('p','estado-vazio','Nenhum chamado registrado.'));return;}
    tickets.forEach(ticket=>{
      const article=el('article','motorista-pendente');
      const content=el('div');
      content.append(el('strong','',ticket.assunto),el('p','',ticket.mensagem),
        el('small','texto-secundario',`${ticket.usuario?.nome || 'Usuário'} • ${safeDate(ticket.createdAt)} • ${ticket.status}`));
      if(ticket.resposta)content.append(el('p','texto-secundario',`Resposta: ${ticket.resposta}`));
      const button=el('button','botao botao-secundario-pequeno',ticket.status==='Resolvido'?'Resolvido':'Responder');
      button.type='button';
      button.disabled = ticket.status === 'Resolvido';
      button.addEventListener('click',async()=>{
        const resposta=window.prompt(`Responder ao chamado "${ticket.assunto}"`);
        if(!resposta)return;
        try{
          await request(`/chamados/${ticket.id}`,{method:'PATCH',body:{resposta,status:'Resolvido'}});
          message('Resposta registrada.','sucesso');
          article.remove();
        }catch(e){message(e.message,'erro');}
      });
      article.append(content,button);host.append(article);
    });
  }

  async function exportCsv() {
    try {
      const response=await fetch(`${API}/entregas/exportar.csv`,{headers:{Authorization:`Bearer ${token()}`}});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.mensagem||'Falha ao exportar CSV.');}
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const link=el('a');link.href=url;link.download='urbanlink-entregas.csv';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
    } catch(e){message(e.message,'erro');}
  }

  async function manageDeliveriesPage() {
    const form=$('#form-admin-entrega');
    const tbody=$('#entregas-admin-body');
    const [deliveryData, clients, drivers, vehicles] = await Promise.all([
      request('/entregas?limite=100'),
      request('/usuarios?perfil=Cliente&limite=100'),
      request('/usuarios?perfil=Motorista&aprovado=true&limite=100'),
      request('/veiculos?limite=100')
    ]);
    const deliveries=deliveryData.dados || [];
    const clientSelect=$('#admin-cliente'), driverSelect=$('#admin-motorista'), vehicleSelect=$('#admin-veiculo');
    fillSelect(clientSelect,clients.dados||[],'Selecione um cliente');
    fillSelect(driverSelect,drivers.dados||[],'Atribuir depois');
    const allAvailableVehicles=(vehicles.dados||[]).filter(v=>v.status==='Disponivel');
    const refreshVehicles=()=>{
      const selectedType=val('admin-tipo-veiculo') || 'Moto';
      fillSelect(vehicleSelect,allAvailableVehicles.filter(v=>v.tipo===selectedType),'Atribuir depois',v=>`${v.placa} • ${v.modelo}`);
    };
    refreshVehicles();
    $('#admin-tipo-veiculo')?.addEventListener('change',refreshVehicles);
    const managerFilter = { status: 'todos' };
    const updateTabCounts = () => {
      const counts = {
        todos: deliveries.length,
        Pendente: deliveries.filter(d=>d.status==='Pendente').length,
        'Em trânsito': deliveries.filter(d=>['Em trânsito','Saiu para entrega'].includes(d.status)).length,
        Entregue: deliveries.filter(d=>d.status==='Entregue').length,
        Cancelada: deliveries.filter(d=>d.status==='Cancelada').length
      };
      $$('.abas-status .aba').forEach(tab=>{
        const counter=$('.contador-aba',tab);
        if(counter)counter.textContent=String(counts[tab.dataset.filtro||'todos']??0);
      });
    };
    const render = filter => {
      if(!tbody)return;
      managerFilter.status=filter;
      tbody.replaceChildren();
      const query=(val('filtro-entregas')||'').toLowerCase();
      const selectedDriver=val('filtro-motorista');
      const statusFilter=val('filtro-status');
      const filtered=deliveries.filter(d=>
        (filter==='todos'||d.status===filter||(filter==='Em trânsito'&&d.status==='Saiu para entrega')) &&
        (!statusFilter||d.status===statusFilter) &&
        (!selectedDriver||String(d.motorista_id)===selectedDriver) &&
        (!query||`${d.codigo} ${d.cliente?.nome||''} ${d.destino} ${d.motorista?.nome||''}`.toLowerCase().includes(query))
      );
      filtered.forEach(d=>{
        const tr=el('tr');
        const checkbox=el('td');const cb=el('input');cb.type='checkbox';cb.value=d.id;cb.setAttribute('aria-label',`Selecionar ${d.codigo}`);checkbox.append(cb);tr.append(checkbox);
        [d.codigo,d.cliente?.nome||'—',`${d.origem} → ${d.destino}`,`${d.janela_inicio||'—'} - ${d.janela_fim||'—'}`,d.motorista?.nome||'Sem motorista'].forEach(value=>tr.append(el('td','',value)));
        const st=el('td');st.append(statusBadge(d.status));tr.append(st);
        const action=el('td','acoes-tabela');
        const transicoes = {
          'Pendente':['Aguardando coleta','Cancelada'],
          'Aguardando coleta':['Em trânsito','Cancelada'],
          'Em trânsito':['Saiu para entrega','Problema'],
          'Saiu para entrega':['Entregue','Problema'],
          'Problema':['Em trânsito','Saiu para entrega','Cancelada']
        };
        const proximosStatus=transicoes[d.status]||[];
        const select=el('select','');
        if(proximosStatus.length){
          proximosStatus.forEach(statusName=>{const option=el('option','',statusName);option.value=statusName;select.append(option);});
        }else{
          const option=el('option','',`Status final: ${d.status}`);option.value='';select.append(option);select.disabled=true;
        }
        const update=el('button','botao-pequeno','Atualizar');update.type='button';update.disabled=!proximosStatus.length;
        update.addEventListener('click',async()=>{
          try{
            await request(`/entregas/${d.id}/status`,{method:'PATCH',body:{status:select.value}});
            message(`Status da entrega ${d.codigo} atualizado.`,'sucesso');window.location.reload();
          }catch(e){message(e.message,'erro');}
        });
        action.append(select,update);tr.append(action);tbody.append(tr);
      });
      if(!filtered.length){const tr=el('tr');const td=el('td','estado-vazio','Nenhuma entrega para este filtro.');td.colSpan=8;tr.append(td);tbody.append(tr);}
    };
    render('todos');
    updateTabCounts();
    fillSelect($('#filtro-motorista'),(drivers.dados||[]),'Todos os motoristas');
    $('#aplicar-filtros')?.addEventListener('click',()=>render(managerFilter.status));
    $('#filtro-entregas')?.addEventListener('input',()=>render(managerFilter.status));
    $('#filtro-status')?.addEventListener('change',()=>render(managerFilter.status));
    $('#filtro-motorista')?.addEventListener('change',()=>render(managerFilter.status));
    $$('.abas-status .aba').forEach(tab=>tab.addEventListener('click',()=>{
      $$('.abas-status .aba').forEach(t=>t.classList.toggle('ativa',t===tab));
      render(tab.dataset.filtro||'todos');
    }));
    $('#abrir-nova-entrega')?.addEventListener('click',()=>{const modal=$('.overlay-modal');if(modal)modal.style.display='flex';});
    const closeModal=()=>{const modal=$('.overlay-modal');if(modal)modal.style.display='none';};
    $('.fechar-modal')?.addEventListener('click',closeModal);
    $('button[type="button"]',form)?.addEventListener('click',closeModal);
    if(form){
      form.addEventListener('submit',async e=>{
        e.preventDefault();
        const body={
          cliente_id:Number(clientSelect?.value),
          destino:val('admin-destino'),
          janela_inicio:val('admin-janela-inicio'),
          janela_fim:val('admin-janela-fim'),
          observacoes:val('admin-observacoes'),
          tipo_veiculo:val('admin-tipo-veiculo'),
          destino_latitude:num('admin-latitude'),
          destino_longitude:num('admin-longitude'),
          tipo_carga:'Volumes gerais'
        };
        if(Boolean(driverSelect?.value)!==Boolean(vehicleSelect?.value)){
          message('Selecione motorista e veículo juntos, ou deixe os dois como “Atribuir depois”.','erro',form);return;
        }
        if ((body.destino_latitude === null) !== (body.destino_longitude === null)) {
          message('Preencha latitude e longitude juntas ou deixe os dois campos vazios.','erro',form);return;
        }
        try{
          const created=await request('/entregas',{method:'POST',body});
          if(driverSelect?.value&&vehicleSelect?.value){
            await request(`/entregas/${created.entrega.id}/atribuicao`,{method:'PATCH',body:{motorista_id:Number(driverSelect.value),veiculo_id:Number(vehicleSelect.value)}});
          }
          message(`Entrega registrada: ${created.entrega.codigo}${body.destino_latitude !== null && body.destino_longitude !== null ? ' e localizada no mapa.' : '. Informe as coordenadas para incluí-la no mapa.'}`,'sucesso');
          setTimeout(()=>window.location.reload(),900);
        }catch(error){message(error.message,'erro',form);}
      });
    }
    $('#exportar-csv')?.addEventListener('click',exportCsv);
  }

  function fillSelect(select, items, placeholder, labelFn = item => item.nome) {
    if(!select)return;
    const first=el('option','',placeholder);first.value='';
    select.replaceChildren(first);
    items.forEach(item=>{const opt=el('option','',labelFn(item));opt.value=item.id;select.append(opt);});
  }

  async function driverDashboardPage(user) {
    const summary=await request('/dashboard/resumo');
    const data=await request('/entregas?limite=100');
    const deliveries=data.dados||[];
    const pendingApproval=user?.aprovado===false;
    if(pendingApproval) message('Seu cadastro está em análise. Você já pode completar as informações, mas só poderá iniciar entregas após a aprovação do gestor.','info');
    const live=deliveries.filter(d=>!['Entregue','Cancelada'].includes(d.status));
    const metricCards=$$('.cartao-info');
    if(metricCards[0]){const p=$('.numero-metrica',metricCards[0]);if(p)p.textContent=`${summary.entregues} de ${summary.total}`;}
    if(metricCards[1]){const p=$('.numero-metrica',metricCards[1]);if(p)p.textContent=live.length?`${live.length} ativa(s)`:'Nenhuma';}
    const list=$('.lista-sequencia-paradas');
    if(list){
      list.replaceChildren();
      live.forEach((d,i)=>{
        const item=el('div','item-sequencia');
        item.append(el('span','num-circulo azul',String(i+1)));
        const detail=el('div','detalhe');detail.append(el('strong','',d.destino),el('small','',`${d.codigo} • ${d.status}`));
        item.append(detail,statusBadge(d.status));list.append(item);
      });
      if(!live.length)list.append(el('p','estado-vazio','Nenhuma entrega atribuída à sua conta.'));
    }
    let current=live[0];
    const address=$('.endereco-parada');
    const customer=$('.info-cliente-linha strong');
    if(current){
      if(address)address.textContent=current.destino;
      if(customer)customer.textContent=current.destinatario_nome;
    }else if(address)address.textContent='Nenhuma entrega ativa';
    const first=$('#driver-arrival'), confirm=$('#driver-confirm');
    const updateControls=()=>{
      if(!current)return;
      if(first){
        first.disabled=pendingApproval;
        first.textContent=current.status==='Aguardando coleta'?'Iniciar transporte':current.status==='Em trânsito'?'Cheguei ao destino':'Etapa atualizada';
      }
      if(confirm){confirm.disabled=pendingApproval||current.status!=='Saiu para entrega';}
    };
    updateControls();
    if(!current) {
      if(first){first.disabled=true;first.textContent='Nenhuma entrega ativa';}
      if(confirm)confirm.disabled=true;
    }
    if(first)first.addEventListener('click',async()=>{
      if(!current||pendingApproval)return;
      const next=current.status==='Aguardando coleta'?'Em trânsito':current.status==='Em trânsito'?'Saiu para entrega':null;
      if(!next)return;
      try{
        await request(`/entregas/${current.id}/status`,{method:'PATCH',body:{status:next}});
        current.status=next;updateControls();message(`Entrega ${current.codigo}: ${next}.`,'sucesso');
      }catch(e){message(e.message,'erro');}
    });
    if(confirm)confirm.addEventListener('click',async()=>{
      if(!current||current.status!=='Saiu para entrega'||pendingApproval)return;
      try{
        await request(`/entregas/${current.id}/status`,{method:'PATCH',body:{status:'Entregue'}});
        message(`Entrega ${current.codigo} concluída.`,'sucesso');window.location.reload();
      }catch(e){message(e.message,'erro');}
    });
  }

  async function routePage(user) {
    if ($('#urbanlink-map')) return; // O mapa Leaflet possui inicialização própria em mapa.js.
    const data=await request('/entregas?limite=100');
    const deliveries=(data.dados||[]).filter(d=>!['Entregue','Cancelada'].includes(d.status));
    const list=$('#lista-paradas-rota');
    if(list){
      list.replaceChildren();
      deliveries.forEach((d,i)=>{
        const item=el('div','item-parada');
        item.append(el('span','numero-parada',String(i+1)));
        const info=el('div','info-parada');info.append(el('strong','',d.destino),el('small','',`${d.codigo} • ${d.status}`));
        item.append(info);list.append(item);
      });
      if(!deliveries.length)list.append(el('p','estado-vazio','Não há entregas em aberto para planejar.'));
    }
    const metrics=$$('.item-metrica-rota strong');
    if(metrics[0])metrics[0].textContent='— km';
    if(metrics[1])metrics[1].textContent='— min';
    if(metrics[2])metrics[2].textContent=String(deliveries.length);
    const optimize=$('#otimizar-rota'), start=$('#iniciar-rota');
    let plannedRoute=null;
    const makeRoute=async()=>{
      if(!deliveries.length)throw new Error('Não há entregas em aberto.');
      const coords=deliveries.filter(d=>d.destino_latitude!==null&&d.destino_longitude!==null);
      if(coords.length!==deliveries.length)throw new Error('Algumas entregas não têm coordenadas de destino. Informe latitude e longitude no cadastro da entrega para calcular a rota.');
      let position=null;
      if(navigator.geolocation){
        try{
          position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(
            p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),
            ()=>reject(new Error('Geolocalização indisponível')),
            {enableHighAccuracy:true,timeout:10000}
          ));
        }catch(_e){ position=null; }
      }
      if(position && user?.perfil==='Motorista'){
        try{
          const vehicleData=await request('/veiculos');
          const vehicle=(vehicleData.dados||[])[0];
          if(vehicle)await request(`/veiculos/${vehicle.id}/posicoes`,{method:'POST',body:{latitude:position.latitude,longitude:position.longitude,status:'Em Rota'}});
        }catch(_e){ /* O cálculo da rota poderá usar a posição enviada na requisição. */ }
      }
      const result=await request('/rotas/otimizar',{method:'POST',body:{entrega_ids:coords.map(d=>d.id),origem:position,velocidade_media_kmh:30}});
      plannedRoute=result.rota;
      if(metrics[0])metrics[0].textContent=`${Number(result.rota.distancia_total_km).toFixed(1)} km`;
      if(metrics[1])metrics[1].textContent=`${result.rota.tempo_estimado_min} min`;
      if(list){
        list.replaceChildren();
        (result.paradas||[]).forEach(p=>{
          const item=el('div','item-parada');
          item.append(el('span','numero-parada',String(p.ordem)));
          const info=el('div','info-parada');info.append(el('strong','',p.entrega.destino),el('small','',p.entrega.codigo));
          item.append(info);list.append(item);
        });
      }
      message('Rota calculada pelo método do vizinho mais próximo. A distância é em linha reta entre coordenadas e não considera tráfego ou vias.','sucesso');
    };
    optimize?.addEventListener('click',async()=>{try{await makeRoute();}catch(e){message(e.message,'erro');}});
    start?.addEventListener('click',async()=>{
      try{
        if(!plannedRoute)await makeRoute();
        await request(`/rotas/${plannedRoute.id}/status`,{method:'PATCH',body:{status:'Em andamento'}});
        message('Rota iniciada.','sucesso');
      }catch(e){message(e.message,'erro');}
    });
  }

  async function simulationPage() {
    const form=$('#form-simulacao');
    const select=$('#simulacao-entregas');
    const host=$('#simulacoes-salvas');
    const [deliveryData, simulationData]=await Promise.all([
      request('/entregas?limite=100'), request('/simulacoes')
    ]);
    const eligible=(deliveryData.dados||[]).filter(d=>
      !['Entregue','Cancelada'].includes(d.status) &&
      d.destino_latitude!==null && d.destino_longitude!==null
    );
    if(select){
      select.replaceChildren();
      eligible.forEach(d=>{
        const option=el('option','',`${d.codigo} • ${d.destino}`);
        option.value=d.id;select.append(option);
      });
      if(!eligible.length)select.append(el('option','',"Nenhuma entrega pendente com coordenadas cadastradas."));
    }
    const renderSaved=(items)=>{
      if(!host)return;
      host.replaceChildren();
      if(!items.length){const tr=el('tr');const td=el('td','estado-vazio','Ainda não há simulações salvas.');td.colSpan=7;tr.append(td);host.append(tr);return;}
      items.forEach(item=>{
        const tr=el('tr');
        [item.nome,`${Number(item.distancia_total_km).toFixed(2)} km`,
          `${item.tempo_base_min} min`,`${item.tempo_simulado_min} min`,
          `+${item.acrescimo_min} min`,safeDate(item.createdAt)].forEach(v=>tr.append(el('td','',v)));
        const action=el('td');const button=el('button','botao-pequeno','Excluir');button.type='button';
        button.addEventListener('click',async()=>{
          try{await request(`/simulacoes/${item.id}`,{method:'DELETE'});tr.remove();message('Simulação excluída.','sucesso');}
          catch(e){message(e.message,'erro');}
        });
        action.append(button);tr.append(action);host.append(tr);
      });
    };
    renderSaved(simulationData.dados||[]);
    if(form)form.addEventListener('submit',async e=>{
      e.preventDefault();
      const ids=Array.from(select?.selectedOptions||[]).map(o=>Number(o.value)).filter(Number.isInteger);
      if(!ids.length||ids.length>50){message('Selecione de 1 a 50 entregas com coordenadas cadastradas.','erro',form);return;}
      try{
        const result=await request('/simulacoes',{method:'POST',body:{
          nome:val('simulacao-nome'),
          entrega_ids:ids,
          origem:{latitude:num('simulacao-lat'),longitude:num('simulacao-lon')},
          velocidade_base_kmh:num('simulacao-velocidade'),
          fator_congestionamento:num('simulacao-congestionamento')
        }});
        const box=$('#resultado-simulacao');
        if(box){
          box.replaceChildren(
            el('strong','',result.simulacao.nome),
            el('p','',`Distância aproximada: ${Number(result.simulacao.distancia_total_km).toFixed(2)} km`),
            el('p','',`Tempo-base: ${result.simulacao.tempo_base_min} min`),
            el('p','',`Tempo no cenário: ${result.simulacao.tempo_simulado_min} min`),
            el('p','',`Acréscimo estimado: ${result.simulacao.acrescimo_min} min`)
          );
        }
        message(result.mensagem,'sucesso',form);
        renderSaved([result.simulacao,...(simulationData.dados||[])]);
      }catch(error){message(error.message,'erro',form);}
    });
  }

  async function supportPage() {
    const host=$('#historico-chamados');
    const form=$('#form-chamado');
    const params = new URLSearchParams(window.location.search);
    const subjectInput = $('#assunto-chamado');
    const messageInput = $('#mensagem-chamado');
    const requestedSubject = params.get('assunto');
    const requestedMessage = params.get('mensagem');
    const trackingCode = params.get('codigo');
    if (subjectInput && requestedSubject) subjectInput.value = requestedSubject;
    if (messageInput && requestedMessage) messageInput.value = requestedMessage;
    else if (messageInput && trackingCode) messageInput.value = `Olá, preciso de ajuda com a entrega ${trackingCode}.`;
    const load=async()=>{
      const result=await request('/chamados');
      if(!host)return;
      host.replaceChildren();
      (result.dados||[]).forEach(ticket=>{
        const box=el('div','balao-chat agente');
        box.append(el('strong','',ticket.assunto),el('p','',ticket.mensagem),el('small','',`${ticket.status} • ${safeDate(ticket.createdAt)}`));
        if(ticket.resposta)box.append(el('p','',`Resposta: ${ticket.resposta}`));
        host.append(box);
      });
      if(!(result.dados||[]).length)host.append(el('p','estado-vazio','Ainda não há chamados. Envie sua mensagem para abrir um atendimento.'));
    };
    if(form)form.addEventListener('submit',async e=>{
      e.preventDefault();
      try{
        await request('/chamados',{method:'POST',body:{assunto:val('assunto-chamado')||'Atendimento geral',mensagem:val('mensagem-chamado')}});
        form.reset();
        if (subjectInput) subjectInput.value = '';
        message('Mensagem registrada como chamado. A equipe responderá por esta tela; atualize a página para consultar novas respostas.','sucesso');
        await load();
      }catch(error){message(error.message,'erro');}
    });
    await load();
  }

  function globalActions() {
    $$('a[data-aviso]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();message(a.dataset.aviso,'info');}));
    $$('[data-action="nova-entrega"]').forEach(b=>b.addEventListener('click',()=>{window.location.href='entrega-motorista.html';}));
    $$('[data-action="gestao-entregas"]').forEach(b=>b.addEventListener('click',()=>{window.location.href='entrega-motorista.html';}));
    $$('[data-action="mapa"]').forEach(b=>b.addEventListener('click',()=>{window.location.href='mapa-rotas.html';}));

    const respostasFaq = [
      'Entre na sua conta, informe o código da entrega no campo “Rastrear uma entrega” ou abra Acompanhamento. O sistema mostra o status e o histórico registrado.',
      'O endereço não pode ser editado diretamente depois do envio. Abra um chamado o quanto antes. Enquanto a entrega estiver Pendente ou Aguardando coleta, você pode cancelá-la e criar uma solicitação com o endereço correto.',
      'Entre em contato pelo atendimento e informe o código do pedido. Não considere a entrega concluída até que o sistema registre o status “Entregue”.',
      'O sistema ainda não possui um fluxo automático de devolução. Abra um chamado informando o código da entrega e o motivo para receber orientação da equipe.',
      'A recuperação automática por e-mail não está configurada nesta versão. Solicite ao administrador responsável que oriente a redefinição de acesso.'
    ];
    $$('.item-faq').forEach((item,index)=>{
      if (item.dataset.faqReady === 'true') return;
      const answer = el('p','resposta-faq',respostasFaq[index] || 'Entre em contato pelo formulário de atendimento para receber orientação.');
      answer.hidden = true;
      answer.style.cssText = 'margin:8px 0 12px; padding:0 12px 10px; color:#687386; font-size:.86rem; line-height:1.5;';
      item.after(answer);
      item.setAttribute('role','button');
      item.setAttribute('tabindex','0');
      item.setAttribute('aria-expanded','false');
      const toggle=()=>{
        const open=answer.hidden;
        answer.hidden=!open;
        item.setAttribute('aria-expanded',String(open));
        const plus=$('.icone-mais',item);
        if(plus)plus.textContent=open?'−':'+';
      };
      item.addEventListener('click',toggle);
      item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}});
      item.dataset.faqReady='true';
    });

    $('#baixar-proposta')?.addEventListener('click',()=>{
      const link=el('a');link.href='./assets/proposta-patrocinio-urbanlink.txt';link.download='proposta-patrocinio-urbanlink.txt';
      document.body.append(link);link.click();link.remove();
    });
    $('#falar-equipe')?.addEventListener('click',()=>{
      const target='atendimento-cliente.html?assunto='+encodeURIComponent('Interesse em parceria e patrocínio');
      if (!token()) { message('Entre na sua conta para enviar uma mensagem à equipe de atendimento.','info'); window.location.href='login.html'; return; }
      window.location.href=target;
    });
  }

  async function init() {
    globalActions();
    loginPage();
    cadastroPage();
    const page=document.body.dataset.page || '';
    if(!['login','cadastro',''].includes(page)){
      const user=await protectPage();
      if(!user)return;
      if(page==='vehicle-registration') await vehicleRegistrationPage(user);
      else if(page==='customer-dashboard') await carregarDashboardCliente();
      else if(page==='customer-delivery') await customerDeliveryPage(user);
      else if(page==='tracking') await trackingPage(user);
      else if(page==='admin-dashboard') await carregarAdmin();
      else if(page==='manage-deliveries') await manageDeliveriesPage();
      else if(page==='driver-dashboard') await driverDashboardPage(user);
      else if(page==='driver-route') await routePage(user);
      else if(page==='simulations') await simulationPage();
      else if(page==='support') await supportPage();
    }
    // Populate the profile area on informational pages that do not use a guard.
    if(!document.body.dataset.role && token()) {
      const profile=await carregarPerfil();
      adjustNavigation(profile);
    }
  }

  document.addEventListener('DOMContentLoaded',()=>init().catch(error=>message(error.message,'erro')));
})();
