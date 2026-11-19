const { Op } = require('sequelize');
const { Entrega, EventoEntrega, Usuario, Veiculo } = require('../models');
const { erroHttp, texto, numeroPositivo } = require('../utils/http');

const TRANSICOES = {
  'Pendente': ['Aguardando coleta', 'Cancelada'],
  'Aguardando coleta': ['Em trânsito', 'Cancelada'],
  'Em trânsito': ['Saiu para entrega', 'Problema'],
  'Saiu para entrega': ['Entregue', 'Problema'],
  'Problema': ['Em trânsito', 'Saiu para entrega', 'Cancelada'],
  'Entregue': [],
  'Cancelada': []
};

function validarCoordenada(valor, min, max, nome) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) throw erroHttp(422, `${nome} está fora do intervalo válido.`);
  return n;
}

async function criarEntrega(dados, ator) {
  const clienteId = ator.perfil === 'Cliente' ? ator.id : Number(dados.cliente_id);
  if (!clienteId) throw erroHttp(422, 'Selecione o cliente da entrega.');
  const cliente = await Usuario.findByPk(clienteId);
  if (!cliente || cliente.perfil !== 'Cliente' || !cliente.ativo) throw erroHttp(422, 'Cliente informado não encontrado ou inativo.');

  const destino = texto(dados.destino, 255);
  const destinatario = texto(dados.destinatario_nome || cliente.nome, 120);
  const tipoVeiculo = texto(dados.tipo_veiculo || 'Moto', 20);
  if (!destino) throw erroHttp(422, 'Informe o endereço de entrega.');
  if (!destinatario) throw erroHttp(422, 'Informe o nome de quem receberá a entrega.');
  if (!['Moto', 'Carro', 'Van', 'Caminhão', 'Elétrico'].includes(tipoVeiculo)) throw erroHttp(422, 'Tipo de veículo inválido.');

  const quantidade = numeroPositivo(dados.quantidade_volumes ?? 1, 'quantidade de volumes', true);
  if (!Number.isInteger(quantidade) || quantidade < 1) throw erroHttp(422, 'A quantidade de volumes deve ser um número inteiro maior que zero.');
  const peso = numeroPositivo(dados.peso_kg, 'peso');
  const volume = numeroPositivo(dados.volume_m3, 'volume');
  if ((tipoVeiculo === 'Van' || tipoVeiculo === 'Caminhão') && (!peso || !volume)) {
    throw erroHttp(422, 'Para Van e Caminhão, informe o peso e o volume da carga.');
  }

  const entrega = await Entrega.create({
    cliente_id: clienteId,
    criada_por: ator.id,
    origem: texto(dados.origem, 255) || cliente.endereco_coleta || 'Centro de distribuição',
    origem_latitude: validarCoordenada(dados.origem_latitude, -90, 90, 'Latitude de coleta'),
    origem_longitude: validarCoordenada(dados.origem_longitude, -180, 180, 'Longitude de coleta'),
    destino,
    destino_latitude: validarCoordenada(dados.destino_latitude, -90, 90, 'Latitude de entrega'),
    destino_longitude: validarCoordenada(dados.destino_longitude, -180, 180, 'Longitude de entrega'),
    cep_entrega: texto(dados.cep_entrega, 12) || null,
    bairro: texto(dados.bairro, 100) || null,
    cidade: texto(dados.cidade, 100) || null,
    destinatario_nome: destinatario,
    destinatario_telefone: texto(dados.destinatario_telefone, 30) || null,
    tipo_veiculo: tipoVeiculo,
    tipo_carga: texto(dados.tipo_carga, 80) || 'Volumes gerais',
    quantidade_volumes: quantidade,
    peso_kg: peso,
    volume_m3: volume,
    janela_inicio: texto(dados.janela_inicio, 5) || null,
    janela_fim: texto(dados.janela_fim, 5) || null,
    observacoes: texto(dados.observacoes, 2000) || null,
    status: 'Pendente'
  });

  await EventoEntrega.create({
    entrega_id: entrega.id,
    usuario_id: ator.id,
    status: 'Pendente',
    descricao: 'Solicitação de entrega registrada.'
  });
  return entrega;
}

async function alterarStatus(entrega, novoStatus, ator, descricao) {
  if (!Object.prototype.hasOwnProperty.call(TRANSICOES, novoStatus)) throw erroHttp(422, 'Status de entrega inválido.');
  if (!TRANSICOES[entrega.status].includes(novoStatus)) {
    throw erroHttp(422, `Não é possível alterar uma entrega de "${entrega.status}" para "${novoStatus}".`);
  }
  await entrega.update({ status: novoStatus });
  await EventoEntrega.create({
    entrega_id: entrega.id,
    usuario_id: ator.id,
    status: novoStatus,
    descricao: texto(descricao, 255) || `Status atualizado para ${novoStatus}.`
  });

  if (novoStatus === 'Entregue' || novoStatus === 'Cancelada') {
    if (entrega.veiculo_id) {
      const veiculo = await Veiculo.findByPk(entrega.veiculo_id);
      if (veiculo) {
        const ativas = await Entrega.count({
          where: { veiculo_id: veiculo.id, status: { [Op.notIn]: ['Entregue', 'Cancelada'] } }
        });
        if (ativas === 0 && veiculo.status === 'Em Rota') await veiculo.update({ status: 'Disponivel' });
      }
    }
  }
  return entrega;
}

async function atribuirEntrega(entrega, motoristaId, veiculoId, ator) {
  const motorista = await Usuario.findByPk(motoristaId);
  if (!motorista || motorista.perfil !== 'Motorista' || !motorista.ativo || !motorista.aprovado) {
    throw erroHttp(422, 'O motorista precisa existir, estar ativo e ter o cadastro aprovado.');
  }
  const veiculo = await Veiculo.findByPk(veiculoId);
  if (!veiculo) throw erroHttp(404, 'Veículo não encontrado.');
  if (veiculo.status !== 'Disponivel') throw erroHttp(409, 'O veículo selecionado não está disponível.');
  if (veiculo.tipo !== entrega.tipo_veiculo) {
    throw erroHttp(422, `O veículo escolhido é do tipo ${veiculo.tipo}, mas a entrega exige ${entrega.tipo_veiculo}.`);
  }
  const pesoEntrega = Number(entrega.peso_kg || 0);
  const volumeEntrega = Number(entrega.volume_m3 || 0);
  const capacidadePeso = Number(veiculo.capacidade_kg || 0);
  const capacidadeVolume = veiculo.volume_m3 == null ? null : Number(veiculo.volume_m3);
  if (capacidadePeso > 0 && pesoEntrega > capacidadePeso) {
    throw erroHttp(422, 'O peso da carga excede a capacidade do veículo.');
  }
  if (capacidadeVolume !== null && volumeEntrega > capacidadeVolume) {
    throw erroHttp(422, 'O volume da carga excede a capacidade do veículo.');
  }
  if (veiculo.motorista_id && Number(veiculo.motorista_id) !== Number(motorista.id)) {
    throw erroHttp(409, 'O veículo está vinculado a outro motorista.');
  }
  if (!['Pendente', 'Aguardando coleta'].includes(entrega.status)) {
    throw erroHttp(409, 'Só é possível atribuir motorista a entregas pendentes ou aguardando coleta.');
  }
  await veiculo.update({ motorista_id: motorista.id, status: 'Em Rota' });
  await entrega.update({ motorista_id: motorista.id, veiculo_id: veiculo.id, status: 'Aguardando coleta' });
  await EventoEntrega.create({
    entrega_id: entrega.id,
    usuario_id: ator.id,
    status: 'Aguardando coleta',
    descricao: `Entrega atribuída ao motorista ${motorista.nome} e ao veículo ${veiculo.placa}.`
  });
  return entrega;
}

module.exports = { TRANSICOES, criarEntrega, alterarStatus, atribuirEntrega };
