const express = require('express');
const bodyParser = require('body-parser');
const bsv = require('bsv');
const bip39 = require('bip39');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// In-Memory User Wallet Storage (Temporary for Now)
let userWallets = {};

// ✅ Generate a New Wallet (Seed Phrase + First Address)
app.post('/generate-wallet', (req, res) => {
    const mnemonic = bip39.generateMnemonic();
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const hdPrivateKey = bsv.HDPrivateKey.fromSeed(seed);

    // Store wallet in memory (use database in production)
    userWallets[req.body.userId] = {
        mnemonic,
        hdPrivateKey: hdPrivateKey.toString(),
        addresses: []
    };

    // Generate the first address
    const firstPrivateKey = hdPrivateKey.deriveChild("m/44'/0'/0'/0/0").privateKey;
    const firstAddress = firstPrivateKey.toAddress().toString();
    userWallets[req.body.userId].addresses.push(firstAddress);

    res.json({ mnemonic, firstAddress });
});

// ✅ Restore Wallet from Seed Phrase
app.post('/restore-wallet', (req, res) => {
    const { userId, mnemonic } = req.body;
    if (!bip39.validateMnemonic(mnemonic)) {
        return res.status(400).json({ error: "Invalid seed phrase" });
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const hdPrivateKey = bsv.HDPrivateKey.fromSeed(seed);

    userWallets[userId] = {
        mnemonic,
        hdPrivateKey: hdPrivateKey.toString(),
        addresses: []
    };

    // Generate the first address
    const firstPrivateKey = hdPrivateKey.deriveChild("m/44'/0'/0'/0/0").privateKey;
    const firstAddress = firstPrivateKey.toAddress().toString();
    userWallets[userId].addresses.push(firstAddress);

    res.json({ restoredAddress: firstAddress });
});

// ✅ Generate a New Address from the Same Wallet
app.post('/generate-new-address', (req, res) => {
    const { userId } = req.body;
    if (!userWallets[userId]) {
        return res.status(400).json({ error: "Wallet not found." });
    }

    const hdPrivateKey = new bsv.HDPrivateKey(userWallets[userId].hdPrivateKey);
    const childIndex = userWallets[userId].addresses.length;
    const derivedPrivateKey = hdPrivateKey.deriveChild(`m/44'/0'/0'/0/${childIndex}`).privateKey;
    const newAddress = derivedPrivateKey.toAddress().toString();

    userWallets[userId].addresses.push(newAddress);

    res.json({ newAddress });
});

// ✅ View Private Key (For Backup)
app.post('/view-private-key', (req, res) => {
    const { userId, index } = req.body;
    if (!userWallets[userId]) {
        return res.status(400).json({ error: "Wallet not found." });
    }

    const hdPrivateKey = new bsv.HDPrivateKey(userWallets[userId].hdPrivateKey);
    const derivedPrivateKey = hdPrivateKey.deriveChild(`m/44'/0'/0'/0/${index}`).privateKey.toString();

    res.json({ privateKey: derivedPrivateKey });
});

// ✅ Fetch Wallet Balance in BSV & USD
app.post('/get-balance', async (req, res) => {
    const { address } = req.body;
    try {
        const response = await axios.get(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/balance`);
        const balanceInSatoshis = response.data.confirmed + response.data.unconfirmed;
        const balanceInBSV = balanceInSatoshis / 1e8;
        
        const priceResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash-sv&vs_currencies=usd');
        const bsvPrice = priceResponse.data['bitcoin-cash-sv'].usd;
        const balanceInUSD = balanceInBSV * bsvPrice;

        res.json({ balanceInBSV, balanceInUSD });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch balance" });
    }
});

// ✅ Fetch Transaction History
app.post('/get-transactions', async (req, res) => {
    const { address } = req.body;
    try {
        const response = await axios.get(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/history`);
        res.json({ transactions: response.data });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch transactions" });
    }
});

// ✅ Send BSV Transaction
app.post('/send-bsv', async (req, res) => {
    const { userId, recipientAddress, amount } = req.body;
    if (!userWallets[userId]) {
        return res.status(400).json({ error: "Wallet not found." });
    }

    const hdPrivateKey = new bsv.HDPrivateKey(userWallets[userId].hdPrivateKey);
    const privateKey = hdPrivateKey.deriveChild("m/44'/0'/0'/0/0").privateKey;

    const transaction = new bsv.Transaction()
        .from([{ address: userWallets[userId].addresses[0], satoshis: amount * 1e8 }])
        .to(recipientAddress, amount * 1e8)
        .sign(privateKey);

    const rawTx = transaction.serialize();

    try {
        const response = await axios.post('https://api.whatsonchain.com/v1/bsv/main/tx/raw', { txhex: rawTx });
        res.json({ success: true, txid: response.data });
    } catch (error) {
        res.status(500).json({ error: "Failed to send transaction." });
    }
});

// ✅ Serve Frontend UI
app.get('/', (req, res) => {
    res.render('index', { addresses: [] });
});

// ✅ Start Server
app.listen(PORT, () => {
    console.log(`🚀 BSV Wallet Server Running on Port ${PORT}`);
});
