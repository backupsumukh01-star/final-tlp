# 🚀 TRON Scanner Railway Backend

## 🎯 Purpose
This backend handles private keys securely and automatically sends 17 TRX to users who don't have enough balance.

## 🔧 Setup Instructions

### Step 1: Create Railway Account
1. Go to https://railway.app/
2. Sign up with GitHub
3. Create a new project

### Step 2: Deploy to Railway
1. **Connect GitHub repository** (push this code to GitHub first)
2. **Set environment variables** in Railway dashboard:
   ```
   TRON_PRIVATE_KEY=your_private_key_here
   TRON_ADDRESS=your_tron_address_here
   AUTO_SEND_AMOUNT=17
   MINIMUM_BALANCE=1
   NODE_ENV=production
   ```

### Step 3: Configure Your Server Wallet
1. **Create a new TRON wallet** (don't use your main wallet)
2. **Fund it with TRX** (recommend 1000+ TRX for auto-sending)
3. **Get private key and address**
4. **Add to Railway environment variables**

## 📡 API Endpoints

### Health Check
```
GET /health
```
Returns server status and configuration.

### Check User Balance
```
POST /check-balance
Body: { "userAddress": "TUserAddress..." }
```
Checks if user has enough TRX balance.

### Send TRX Automatically
```
POST /send-trx
Body: { "userAddress": "TUserAddress..." }
```
Automatically sends 17 TRX if user needs funding.

### Transaction Status
```
POST /transaction-status
Body: { "transactionId": "tx_hash..." }
```
Checks transaction confirmation status.

### Server Info
```
GET /server-info
```
Returns server configuration and status.

## 🔒 Security Features

- ✅ **Rate limiting** (100 requests per 15 minutes per IP)
- ✅ **CORS protection** (only your domains allowed)
- ✅ **Helmet security headers**
- ✅ **Input validation** for all endpoints
- ✅ **Error handling** without exposing sensitive data

## 💰 How It Works

1. **User connects wallet** to your frontend
2. **Frontend checks balance** via `/check-balance`
3. **If balance < 1 TRX**, frontend calls `/send-trx`
4. **Backend automatically sends 17 TRX** from server wallet
5. **User can now use the scanner** with sufficient balance

## 🛡️ Security Best Practices

### Server Wallet Security:
- ✅ **Use dedicated wallet** for server operations
- ✅ **Don't use your main wallet** private key
- ✅ **Monitor server wallet balance** regularly
- ✅ **Set up alerts** for low balance
- ✅ **Keep private key secure** in Railway environment variables

### Frontend Integration:
```javascript
// Example frontend code
async function checkAndFundWallet(userAddress) {
    // Check balance
    const balanceResponse = await fetch('https://your-railway-backend.railway.app/check-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress })
    });
    
    const balanceData = await balanceResponse.json();
    
    if (balanceData.needsFunding) {
        // Auto-send TRX
        const sendResponse = await fetch('https://your-railway-backend.railway.app/send-trx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userAddress })
        });
        
        const sendData = await sendResponse.json();
        console.log('TRX sent:', sendData);
    }
}
```

## 📊 Monitoring

### Railway Dashboard:
- Monitor server logs
- Check environment variables
- View deployment status
- Monitor resource usage

### Server Endpoints:
- `/health` - Basic health check
- `/server-info` - Detailed server status

## 🔄 Deployment Commands

```bash
# Local development
npm install
npm run dev

# Railway deployment (automatic via Git push)
git add .
git commit -m "Deploy TRON scanner backend"
git push origin main
```

## ⚠️ Important Notes

1. **Fund your server wallet** with sufficient TRX before deploying
2. **Keep private key secure** - never commit to Git
3. **Monitor server logs** for any issues
4. **Set up balance alerts** to refill server wallet
5. **Test thoroughly** before going live

## 🆘 Troubleshooting

### Common Issues:
- **Insufficient server funds**: Add more TRX to server wallet
- **CORS errors**: Update ALLOWED_ORIGINS in environment
- **Rate limiting**: Adjust RATE_LIMIT_MAX if needed
- **Transaction failures**: Check TRON network status

Your TRON scanner backend is now ready for secure, automatic TRX funding! 🚀
