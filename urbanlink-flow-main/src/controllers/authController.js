const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { UniqueConstraintError } = require('sequelize');
const { Usuario } = require('../models');
const { asyncHandler, erroHttp, texto } = require('../utils/http');

function tokenPara(usuario) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
    throw erroHttp(500, 'JWT_SECRET precisa ter pelo menos 24 caracteres no arquivo .env.');
  }
  return jwt.sign({ id: usuario.id, perfil: usuario.perfil }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  });
}

const cadastrar = asyncHandler(async (req, res) => {
  const nome = texto(req.body.nome, 120);
  const email = texto(req.body.email, 160).toLowerCase();
  const senha = String(req.body.senha || '');
  const perfil = texto(req.body.perfil || 'Cliente', 30);
  const telefone = texto(req.body.telefone, 30) || null;
  const cpfCnpj = texto(req.body.cpf_cnpj, 20).replace(/[^0-9]/g, '') || null;

  if (!nome || !email || !senha) throw erroHttp(422, 'Informe nome, e-mail e senha.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw erroHttp(422, 'Informe um e-mail válido.');
  if (senha.length < 8) throw erroHttp(422, 'A senha deve ter pelo menos 8 caracteres.');
  if (!['Cliente', 'Motorista', 'Administrador'].includes(perfil)) throw erroHttp(422, 'Perfil de cadastro inválido.');
  if (perfil === 'Administrador') {
    if (!process.env.ADMIN_INVITE_CODE || String(req.body.codigo_convite || '') !== process.env.ADMIN_INVITE_CODE) {
      throw erroHttp(403, 'Código de convite de administrador inválido.');
    }
  }
  if (perfil === 'Motorista' && !texto(req.body.cnh, 30)) throw erroHttp(422, 'Informe o número da CNH.');

  try {
    const usuario = await Usuario.create({
      nome,
      email,
      senha_hash: await bcrypt.hash(senha, 12),
      perfil,
      telefone,
      cpf_cnpj: cpfCnpj,
      cep: texto(req.body.cep, 12) || null,
      endereco_coleta: texto(req.body.endereco_coleta, 255) || null,
      cnh: texto(req.body.cnh, 30) || null,
      aprovado: perfil !== 'Motorista',
      ativo: true
    });
    const token = tokenPara(usuario);
    return res.status(201).json({
      mensagem: perfil === 'Motorista'
        ? 'Cadastro criado. Envie os dados do veículo e aguarde a aprovação do gestor.'
        : 'Conta criada com sucesso.',
      token,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil, aprovado: usuario.aprovado }
    });
  } catch (erro) {
    if (erro instanceof UniqueConstraintError) throw erroHttp(409, 'Já existe uma conta com esse e-mail ou documento.');
    throw erro;
  }
});

const login = asyncHandler(async (req, res) => {
  const email = texto(req.body.email, 160).toLowerCase();
  const senha = String(req.body.senha || '');
  if (!email || !senha) throw erroHttp(422, 'Informe e-mail e senha.');
  const usuario = await Usuario.unscoped().findOne({ where: { email } });
  if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
    return res.status(401).json({ mensagem: 'E-mail ou senha inválidos.' });
  }
  if (!usuario.ativo) return res.status(403).json({ mensagem: 'Sua conta está desativada. Entre em contato com o administrador.' });
  const perfilEsperado = texto(req.body.perfil, 30);
  if (perfilEsperado && perfilEsperado !== usuario.perfil) {
    return res.status(403).json({
      mensagem: `Esta tela é destinada ao perfil ${perfilEsperado}. Seu perfil cadastrado é ${usuario.perfil}.`
    });
  }
  return res.status(200).json({
    mensagem: 'Login realizado com sucesso.',
    token: tokenPara(usuario),
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil, aprovado: usuario.aprovado }
  });
});

module.exports = { cadastrar, login };
