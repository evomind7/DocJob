// ─── WEBHOOK DE CONFIRMAÇÃO (InfinitePay) ───
// A InfinitePay chama esta função automaticamente assim que um pagamento é
// aprovado (Pix ou cartão). Só depois de confirmar a autenticidade do aviso
// (reconsultando a própria InfinitePay com /payment_check — nunca confiando
// cegamente no que chega aqui, já que essa URL é pública) é que marcamos o
// pedido como pago no armazenamento (Netlify Blobs).
//
// Requer o pacote "@netlify/blobs" instalado no projeto (npm install @netlify/blobs).

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: 'Método não permitido.' }) };
  }

  const HANDLE = process.env.INFINITEPAY_HANDLE;

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ success: false, message: 'JSON inválido.' }) };
  }

  const { order_nsu: orderNsu, transaction_nsu: transactionNsu, invoice_slug: slug } = data;

  if (!orderNsu || !transactionNsu || !slug) {
    return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Dados incompletos no aviso.' }) };
  }

  // Revalida diretamente com a InfinitePay antes de confiar no aviso.
  try {
    const checkRes = await fetch('https://api.checkout.infinitepay.io/payment_check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: HANDLE, order_nsu: orderNsu, transaction_nsu: transactionNsu, slug })
    });
    const checkData = await checkRes.json();

    if (!checkRes.ok || !checkData.success || !checkData.paid) {
      console.warn('Webhook recebido, mas payment_check não confirmou pagamento:', checkData);
      // Responde 200 mesmo assim para não gerar reenvios infinitos de um aviso inválido.
      return { statusCode: 200, body: JSON.stringify({ success: false, message: 'Pagamento não confirmado.' }) };
    }

    const store = getStore('pagamentos-docjob');
    await store.setJSON(orderNsu, {
      pago: true,
      amount: checkData.amount,
      paid_amount: checkData.paid_amount,
      capture_method: checkData.capture_method,
      transaction_nsu: transactionNsu,
      receipt_url: data.receipt_url || null,
      confirmado_em: new Date().toISOString()
    });

    return { statusCode: 200, body: JSON.stringify({ success: true, message: null }) };
  } catch (err) {
    console.error('Erro ao processar webhook:', err);
    // Responder erro real (não 400) faz a InfinitePay tentar de novo depois.
    return { statusCode: 500, body: JSON.stringify({ success: false, message: err.message }) };
  }
};
