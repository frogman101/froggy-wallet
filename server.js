const express = require('express');
const bodyParser = require('body-parser');
const bsv = require('bsv');
const bip39 = require('bip39');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
npm install axios
const axios = require('axios');

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
        const response = await axios.post('https://api.whatsonchain.com/v1/bsv/main/tx/raw', { tx: rawTx });
        res.json({ success: true, txid: response.data });
    } catch (error) {
        res.status(500).json({ error: "Failed to send transaction." });
    }
});


// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Store wallets in memory (temporary solution)
let userWallets = {};

// Generate a new wallet
app.post('/generate-wallet', (req, res) => {
    res.json({ mnemonic, firstAddress });
    const mnemonic = bip39.generateMnemonic();
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const hdPrivateKey = bsv.HDPrivateKey.fromSeed(seed);

    userWallets[req.body.userId] = {
        mnemonic: mnemonic,
        hdPrivateKey: hdPrivateKey.toString(),
        addresses: []
    };

    // Generate first address
    const firstPrivateKey = hdPrivateKey.deriveChild("m/44'/0'/0'/0/0").privateKey;
    const firstAddress = firstPrivateKey.toAddress().toString();
    userWallets[req.body.userId].addresses.push(firstAddress);

    res.json({ mnemonic, firstAddress });
});

// Generate a new address from the same seed
app.post('/generate-new-address', (req, res) => {
    const { userId } = req.body;
    if (!userWallets[userId]) {
        return res.status(400).json({ error: "User wallet not found" });
    }

    const hdPrivateKey = new bsv.HDPrivateKey(userWallets[userId].hdPrivateKey);
    const childIndex = userWallets[userId].addresses.length;
    const derivedPrivateKey = hdPrivateKey.deriveChild(`m/44'/0'/0'/0/${childIndex}`).privateKey;
    const newAddress = derivedPrivateKey.toAddress().toString();

    userWallets[userId].addresses.push(newAddress);

    res.json({ newAddress });
});

// Render homepage
app.get('/', (req, res) => {
    res.render('index', { addresses: [] });
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
