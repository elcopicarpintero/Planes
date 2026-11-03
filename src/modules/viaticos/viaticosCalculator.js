// src/modules/viaticos/viaticosCalculator.js
// Basado en CCT 402/2000 "E" ARSA - APLA (Actualizado Diciembre 2024)

export const VALORES_CCT = {
  VIATICO_DIARIO_BASE: 17122, // Anexo III A
  E_LEARNING_DIA: 61465.06,   // Art. 8.24
  TABLA_CABOTAJE: {           // Anexo III B
    'USH': 58650,
    'RGR': 51799,
    'FTE': 51791,
    'BRC': 51791,
    'CPC': 37062,
    'NQN': 51791,
    'CRD': 51791,
    'MDZ': 45323,
    'COR': 43082,
    'SLA': 37668,
    'IGR': 25810,
    'AEP': 36811,
    'EZE': 36811,
    'DEFAULT': 21492
  }
};

/**
 * Calcula la liquidación de viáticos según norma CCT
 */
export function calcularViaticoPairing(pairing, funcionUsuario = 'Copiloto') {
  let totalARS = 0;
  const esComandante = funcionUsuario === 'Comandante';
  const multiplicadorMando = esComandante ? 1.30 : 1.0; // +30% gastos extras Art. 8.16 / Anexo III B

  pairing.forEach(dia => {
    if (dia.tipo === 'ACTIVIDAD_BASE') {
      totalARS += VALORES_CCT.VIATICO_DIARIO_BASE;
    } else if (dia.tipo === 'E_LEARNING') {
      totalARS += VALORES_CCT.E_LEARNING_DIA;
    } else if (dia.tipo === 'POSTA_CABOTAJE') {
      const valorBaseEscala = VALORES_CCT.TABLA_CABOTAJE[dia.escala] || VALORES_CCT.TABLA_CABOTAJE.DEFAULT;
      let porcentajeRegreso = 1.0;

      if (dia.esDiaRegreso && dia.horaSalidaRegreso) {
        const horaSalida = parseInt(dia.horaSalidaRegreso.split(':')[0], 10);
        if (horaSalida >= 13 && horaSalida < 20) {
          porcentajeRegreso = 0.50; // Art. 8.8
        } else if (horaSalida < 13) {
          porcentajeRegreso = 0.0;
        }
      }

      totalARS += (valorBaseEscala * porcentajeRegreso * multiplicadorMando);
    }
  });

  return totalARS;
}