// ─── CONSULTAR STATUS DO PAGAMENTO ───
// O front-end chama isso a cada poucos segundos (enquanto o modal do PIX
// está aberto) para saber se o webhook já confirmou o pagamento daquele
// order_nsu. Não expõe nenhum dado sensível — só "pago" ou "pendente".

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const orderNsu = event.queryStringParameters && event.queryStringParameters.order_nsu;

  if (!orderNsu) {
    return { statusCode: 400, body: JSON.stringify({ error: 'order_nsu ausente.' }) };
  }

  try {
    const store = getStore('pagamentos-docjob');
    const registro = await store.get(orderNsu, { type: 'json' });
    return {
      statusCode: 200,
      body: JSON.stringify({ status: registro && registro.pago ? 'approved' : 'pending' })
    };
  } catch (err) {
    // Se ainda não existe registro nenhum, a lib lança erro — tratamos como "pendente".
    return { statusCode: 200, body: JSON.stringify({ status: 'pending' }) };
  }
};
