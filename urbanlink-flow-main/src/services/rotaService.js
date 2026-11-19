const { Entrega, Rota, Veiculo, PosicaoVeiculo } = require('../models');
const { erroHttp } = require('../utils/http');

const { haversineKm, otimizarParadas } = require('../utils/rotaMath');

async function criarRota({ entregaIds, origem, velocidadeMedia, motoristaId, criadorId }) {
  if (!Array.isArray(entregaIds) || entregaIds.length < 1 || entregaIds.length > 50) {
    throw erroHttp(422, 'Informe de 1 a 50 identificadores de entrega para montar a rota.');
  }
  const lat = Number(origem?.latitude);
  const lon = Number(origem?.longitude);
  if (origem == null || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw erroHttp(422, 'Informe latitude e longitude válidas para o ponto de partida.');
  }
  const velocidade = Number(velocidadeMedia || 30);
  if (!Number.isFinite(velocidade) || velocidade < 5 || velocidade > 120) {
    throw erroHttp(422, 'A velocidade média deve estar entre 5 e 120 km/h.');
  }

  const idsUnicos = [...new Set(entregaIds.map(Number))];
  const entregas = await Entrega.findAll({
    where: { id: idsUnicos, ...(motoristaId ? { motorista_id: motoristaId } : {}) }
  });
  if (entregas.length !== idsUnicos.length) throw erroHttp(404, 'Uma ou mais entregas não foram encontradas ou não pertencem ao motorista.');
  const elegiveis = entregas.filter((e) => !['Entregue', 'Cancelada'].includes(e.status));
  if (!elegiveis.length) throw erroHttp(422, 'Não há entregas em aberto para montar uma rota.');

  const resultado = otimizarParadas({ latitude: lat, longitude: lon }, elegiveis);
  const tempo = Math.ceil((resultado.distancia / velocidade) * 60);
  const rota = await Rota.create({
    nome: `Rota ${new Date().toLocaleDateString('pt-BR')}`,
    motorista_id: motoristaId || elegiveis[0].motorista_id || null,
    criada_por: criadorId,
    entrega_ids: resultado.ordem.map((p) => p.entrega.id),
    distancia_total_km: resultado.distancia,
    tempo_estimado_min: tempo,
    velocidade_media_kmh: velocidade,
    origem_latitude: lat,
    origem_longitude: lon,
    status: 'Planejada'
  });
  return { rota, paradas: resultado.ordem.map((p, i) => ({ ordem: i + 1, entrega: p.entrega })) };
}

async function obterOrigemMotorista(motoristaId) {
  const veiculo = await Veiculo.findOne({ where: { motorista_id: motoristaId } });
  if (!veiculo) return null;
  return PosicaoVeiculo.findOne({ where: { veiculo_id: veiculo.id }, order: [['registrada_em', 'DESC']] });
}

module.exports = { haversineKm, otimizarParadas, criarRota, obterOrigemMotorista };
