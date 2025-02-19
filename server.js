require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require("firebase/auth");
const bsv = require("bsv");
const bip39 = require("bip39");
const QRCode = require("qrcode");
const morgan = require("morgan");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(cors());
app.use(morgan("dev"));
app.use(helmet());
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: true,
  })
);

// Firebase Config
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
initializeApp(firebaseConfig);
const auth = getAuth();

// User Registration
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    res.json({ success: true, uid: userCredential.user.uid });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// User Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    req.session.user = userCredential.user.uid;
    res.json({ success: true, uid: userCredential.user.uid });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Generate Wallet
app.post("/generate-wallet", (req, res) => {
  const mnemonic = bip39.generateMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdPrivateKey = bsv.HDPrivateKey.fromSeed(seed);
  const firstPrivateKey = hdPrivateKey.deriveChild("m/44'/0'/0'/0/0").privateKey;
  const firstAddress = firstPrivateKey.toAddress().toString();
  res.json({ mnemonic, firstAddress });
});

// Generate QR Code for Address
app.post("/generate-qr", async (req, res) => {
  try {
    const { address } = req.body;
    const qrCodeUrl = await QRCode.toDataURL(address);
    res.json({ qrCodeUrl });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

// Get Balance
app.post("/get-balance", async (req, res) => {
  try {
    const { address } = req.body;
    const response = await axios.get(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/balance`);
    res.json({ balance: response.data });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

// Send BSV Transaction
app.post("/send-bsv", async (req, res) => {
  try {
    const { senderPrivateKey, recipientAddress, amount } = req.body;
    const privateKey = new bsv.PrivateKey(senderPrivateKey);
    const transaction = new bsv.Transaction()
      .from([{ address: privateKey.toAddress().toString(), satoshis: amount * 1e8 }])
      .to(recipientAddress, amount * 1e8)
      .sign(privateKey);
    const rawTx = transaction.serialize();
    const response = await axios.post("https://api.whatsonchain.com/v1/bsv/main/tx/raw", { txhex: rawTx });
    res.json({ success: true, txid: response.data });
  } catch (error) {
    res.status(500).json({ error: "Failed to send transaction." });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: "Logged out successfully." });
  });
});

app.get("/", (req, res) => {
  res.render("index");
});

app.listen(PORT, () => {
  console.log(`🚀 Froggy Wallet Running on Port ${PORT}`);
});
