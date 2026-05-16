const { setServers } = require('dns').promises;
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

setServers(['1.1.1.1', '8.8.8.8']);

// Add this temporarily
console.log('MONGO_URI:', process.env.MONGO_URI);

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static('../client'));

// ── Connect to MongoDB ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Successfully connected to MongoDB!');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

// ── Test route ──
app.post('/api/create-game', (req, res) => {
  const { playerName } = req.body;

  if (!playerName) {
    return res.status(400).json({ error: 'Player name is required.' });
  }

  // MongoDB is connected — more logic will be added here soon
  console.log(`🎮 Create game request received from: ${playerName}`);
  res.status(200).json({ message: 'MongoDB connection successful!', playerName });
});

// ── Start server ──
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
