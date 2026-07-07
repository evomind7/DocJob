// ─── CRIAR COBRANÇA (InfinitePay Checkout) ───
// Recebe do front-end apenas a LISTA DE ITENS (ex: ["curriculo"] ou
// ["curriculo","carta"]). O preço de cada item é definido AQUI, no servidor
// — o front-end nunca envia nem pode alterar o valor. Isso evita que alguém
// manipule o preço mexendo no navegador.
//
// A API da InfinitePay usada aqui é a de "Link de Pagamento" (Checkout):
// https://api.checkout.infinitepay.io/links — não exige chave secreta,
// só o seu "handle" (a InfiniteTag, sem o $). Ela devolve um link pronto
// (com QR Pix e opção de cartão) para você abrir para o cliente.

const crypto = require('crypto');

// Preços em CENTAVOS (a API da InfinitePay trabalha em centavos).
const PRECOS_CENTAVOS = { curriculo: 299, carta: 100 };
const NOMES_ITEM = { curriculo: 'Currículo profissional (DocJob)', carta: 'Carta de Apresentação (DocJob)' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  const HANDLE = process.env.INFINITEPAY_HANDLE;
  // process.env.URL é preenchido automaticamente pela Netlify com a URL do
  // seu site em produção. Em preview/local, você pode definir SITE_URL manualmente.
  const SITE_URL = process.env.URL || process.env.SITE_URL;

  if (!HANDLE) {
    return { statusCode: 500, body: JSON.stringify({ error: 'INFINITEPAY_HANDLE não configurado nas variáveis de ambiente da Netlify.' }) };
  }
  if (!SITE_URL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'URL do site não disponível.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido.' }) };
  }

  // Filtra só itens conhecidos — ignora qualquer coisa estranha que venha no payload.
  const itensPedidos = Array.isArray(body.itens)
    ? [...new Set(body.itens)].filter((it) => PRECOS_CENTAVOS[it] !== undefined)
    : [];

  if (itensPedidos.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Nenhum item válido informado.' }) };
  }

  // Identificador único deste pedido — usado depois para confirmar o pagamento.
  const orderNsu = crypto.randomUUID();

  const items = itensPedidos.map((it) => ({
    quantity: 1,
    price: PRECOS_CENTAVOS[it],
    description: NOMES_ITEM[it]
  }));

  const payload = {
    handle: HANDLE,
    redirect_url: `${SITE_URL}/?pagamento=concluido&order_nsu=${orderNsu}`,
    webhook_url: `${SITE_URL}/.netlify/functions/pagamento-webhook`,
    order_nsu: orderNsu,
    items
  };

  try {
    const res = await fetch('https://api.checkout.infinitepay.io/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.url) {
      console.warn('InfinitePay recusou o pedido de link:', data);
      return { statusCode: 502, body: JSON.stringify({ error: 'Não foi possível gerar o link de pagamento.' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ url: data.url, order_nsu: orderNsu })
    };
  } catch (err) {
    console.error('Erro ao chamar a API da InfinitePay:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao gerar cobrança: ' + err.message }) };
  }
};
