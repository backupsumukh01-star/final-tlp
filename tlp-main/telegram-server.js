const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 4000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map((item) => item.trim());

function setCors(res) {
  const origin = ALLOWED_ORIGINS.includes('*') ? '*' : (res.socket?.remoteAddress ? '*' : '*');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', reject);
  });
}

async function sendTelegramMessage(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error('Missing BOT_TOKEN or CHAT_ID environment variables');
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || 'Telegram API request failed');
  }

  return data;
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Telegram server is running' }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/telegram') {
    try {
      const payload = await readBody(req);
      const text = payload.text || payload.message || 'No message provided';

      const result = await sendTelegramMessage(text);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (error) {
      console.error('Telegram send failed:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Telegram server running on http://localhost:${PORT}`);
});
