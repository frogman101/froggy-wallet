const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const bsv = require('bsv');
const bip39 = require('bip39');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});


app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

let users = {}; // Temporary in-memory user storage (use database in production)
let userWallets = {}; // Stores wallets per user (in-memory)

// ✅ User Registration
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (users[username]) {
        return res.status(400).json({ error: "Username already exists." });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    users[username] = { password: hashedPassword, wallets: [] };
    res.json({ success: true, message: "User registered!" });
});

// ✅ User Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!users[username]) {
        return res.status(400).json({ error: "User not found." });
    }
    const validPassword = await bcrypt.compare(password, users[username].password);
    if (!validPassword) {
        return res.status(400).json({ error: "Invalid credentials." });
    }
    req.session.user = username;
    res.json({ success: true, message: "Login successful!" });
});

// ✅ User Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// ✅ Check if User is Logged In
app.get('/session', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// ✅ Generate Wallet (Seed Phrase & Address)
app.post('/generate-wallet', (req, res) => {
    const { userId } = req.body;
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const mnemonic = bip39.generateMnemonic();
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const hdPrivateKey = bsv.HDPrivateKey.fromSeed(seed);

    userWallets[userId] = {
        mnemonic,
        hdPrivateKey: hdPrivateKey.toString(),
        addresses: []
    };

    const firstPrivateKey = hdPrivateKey.deriveChild("m/44'/0'/0'/0/0").privateKey;
    const firstAddress = firstPrivateKey.toAddress().toString();
    userWallets[userId].addresses.push(firstAddress);

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

    const firstPrivateKey = hdPrivateKey.deriveChild("m/44'/0'/0'/0/0").privateKey;
    const firstAddress = firstPrivateKey.toAddress().toString();
    userWallets[userId].addresses.push(firstAddress);

    res.json({ restoredAddress: firstAddress });
});

// ✅ Generate a New Address
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

// ✅ Get Wallet Balance (USD & BSV)
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

// ✅ Serve UI
app.get('/', (req, res) => {
    res.render('index', { addresses: [] });
});

// ✅ Start Server
app.listen(PORT, () => {
    console.log(`🚀 Froggy BSV Wallet Server Running on Port ${PORT}`);
});
