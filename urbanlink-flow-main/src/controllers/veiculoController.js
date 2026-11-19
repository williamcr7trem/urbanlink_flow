const { Op, UniqueConstraintError } = require('sequelize');
const { Veiculo, Usuario, PosicaoVeiculo, Entrega } = require('../models');
const { asyncHandler, erroHttp, texto, numeroPositivo, paginacao } = require('../utils/http');

function normalizarPlaca(valor) {
  return texto(valor, 10).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

const listar = asyncHandler(async (req, res) => {
  const { pagina, limite, offset } = paginacao(req.query);
  const where = req.usuario.perfil === 'Motorista' ? { motorista_id: req.usuario.id } : {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.busca) where.placa = { [Op.like]: `%${normalizarPlaca(req.query.busca)}%` };
  const resultado = await Veiculo.findAndCountAll({
    where, limit: limite, offset, order: [['createdAt', 'DESC']],
    include: [{ model: Usuario, as: 'motorista', attributes: ['id', 'nome', 'email'] }]
  });
  res.json({ dados: resultado.rows, total: resultado.count, pagina, limite, totalPaginas: Math.ceil(resultado.count / limite) });
});

async function criarRegistro(dados, motoristaId = null) {
  const placa = normalizarPlaca(dados.placa);
  const modelo = texto(dados.modelo, 100);
  const tipo = texto(dados.tipo, 20);
  if (!placa || !modelo || !tipo) throw erroHttp(422, 'Informe placa, modelo e tipo do veículo.');
  if (!['Moto', 'Carro', 'Van', 'Caminhão', 'Elétrico'].includes(tipo)) throw erroHttp(422, 'Tipo de veículo inválido.');
  const capacidade = numeroPositivo(dados.capacidade_kg ?? 0, 'capacidade');
  try {
    return await Veiculo.create({
      placa, modelo, tipo, motorista_id: motoristaId,
      cor: texto(dados.cor, 40) || null,
      ano: dados.ano ? Number(dados.ano) : null,
      tipo_combustivel: texto(dados.tipo_combustivel, 40) || null,
      capacidade_kg: capacidade,
      volume_m3: numeroPositivo(dados.volume_m3, 'volume'),
      capacidade_tanque_l: numeroPositivo(dados.capacidade_tanque_l, 'capacidade do tanque'),
      status: 'Disponivel'
    });
  } catch (erro) {
    if (erro instanceof UniqueConstraintError) throw erroHttp(409, 'Já existe um veículo cadastrado com essa placa.');
    throw erro;
  }
}

const cadastrar = asyncHandler(async (req, res) => {
  const veiculo = await criarRegistro(req.body);
  res.status(201).json({ mensagem: 'Veículo cadastrado.', veiculo });
});

const cadastrarMeuVeiculo = asyncHandler(async (req, res) => {
  const motorista = await Usuario.findByPk(req.usuario.id);
  if (motorista.perfil !== 'Motorista') throw erroHttp(403, 'Somente motoristas podem cadastrar seu próprio veículo nesta etapa.');
  const existente = await Veiculo.findOne({ where: { motorista_id: motorista.id } });
  if (existente) throw erroHttp(409, 'Este motorista já possui um veículo vinculado. Solicite a alteração ao gestor.');
  const veiculo = await criarRegistro(req.body, motorista.id);
  res.status(201).json({ mensagem: 'Veículo cadastrado. Seu perfil continuará pendente até a aprovação do gestor.', veiculo });
});

const detalhar = asyncHandler(async (req, res) => {
  const veiculo = await Veiculo.findOne({
    where: {
      id: req.params.id,
      ...(req.usuario.perfil === 'Motorista' ? { motorista_id: req.usuario.id } : {})
    },
    include: [{ model: Usuario, as: 'motorista', attributes: ['id', 'nome', 'email'] }]
  });
  if (!veiculo) throw erroHttp(404, 'Veículo não encontrado.');
  res.json({ veiculo });
});

const atualizar = asyncHandler(async (req, res) => {
  const veiculo = await Veiculo.findByPk(req.params.id);
  if (!veiculo) throw erroHttp(404, 'Veículo não encontrado.');
  const campos = ['modelo', 'cor', 'ano', 'tipo', 'tipo_combustivel', 'capacidade_kg', 'volume_m3', 'capacidade_tanque_l', 'status'];
  for (const campo of campos) if (req.body[campo] !== undefined) veiculo[campo] = req.body[campo];
  if (req.body.placa !== undefined) veiculo.placa = normalizarPlaca(req.body.placa);
  await veiculo.save().catch((erro) => {
    if (erro instanceof UniqueConstraintError) throw erroHttp(409, 'Já existe um veículo com essa placa.');
    throw erro;
  });
  res.json({ mensagem: 'Veículo atualizado.', veiculo });
});

const excluir = asyncHandler(async (req, res) => {
  const veiculo = await Veiculo.findByPk(req.params.id);
  if (!veiculo) throw erroHttp(404, 'Veículo não encontrado.');
  const ativas = await Entrega.count({
    where: { veiculo_id: veiculo.id, status: { [Op.notIn]: ['Entregue', 'Cancelada'] } }
  });
  if (ativas) throw erroHttp(409, 'O veículo possui entregas em aberto e não pode ser removido.');
  await veiculo.destroy();
  res.json({ mensagem: 'Veículo removido.' });
});

const registrarPosicao = asyncHandler(async (req, res) => {
  if (req.usuario.perfil === 'Motorista' && !req.usuario.aprovado) {
    throw erroHttp(403, 'Aguarde a aprovação do seu cadastro antes de compartilhar a localização.');
  }
  const veiculo = await Veiculo.findByPk(req.params.id);
  if (!veiculo) throw erroHttp(404, 'Veículo não encontrado.');
  if (req.usuario.perfil === 'Motorista' && Number(veiculo.motorista_id) !== req.usuario.id) {
    throw erroHttp(403, 'Você só pode atualizar a posição do veículo vinculado à sua conta.');
  }
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw erroHttp(422, 'Informe latitude e longitude válidas.');
  }
  const posicao = await PosicaoVeiculo.create({
    veiculo_id: veiculo.id,
    latitude,
    longitude,
    velocidade_kmh: numeroPositivo(req.body.velocidade_kmh, 'velocidade')
  });
  if (req.body.status && ['Disponivel', 'Em Rota', 'Manutencao'].includes(req.body.status)) {
    await veiculo.update({ status: req.body.status });
  }
  res.status(201).json({ mensagem: 'Posição registrada.', posicao });
});

const listarPosicoes = asyncHandler(async (req, res) => {
  const veiculo = await Veiculo.findByPk(req.params.id);
  if (!veiculo) throw erroHttp(404, 'Veículo não encontrado.');
  if (req.usuario.perfil === 'Motorista' && Number(veiculo.motorista_id) !== req.usuario.id) {
    throw erroHttp(403, 'Você não tem acesso a este histórico de posições.');
  }
  const posicoes = await PosicaoVeiculo.findAll({
    where: { veiculo_id: veiculo.id }, order: [['registrada_em', 'DESC']], limit: 100
  });
  res.json({ dados: posicoes });
});

module.exports = { listar, cadastrar, cadastrarMeuVeiculo, detalhar, atualizar, excluir, registrarPosicao, listarPosicoes };
