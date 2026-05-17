const { setServers } = require('dns').promises;
setServers(['1.1.1.1', '8.8.8.8']);

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express          = require('express');
const mongoose         = require('mongoose');
const cors             = require('cors');
const path             = require('path');
const { v4: uuidv4 }  = require('uuid');
const Game             = require('./models/Game');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Serve frontend static files ──
app.use(express.static(path.join(__dirname, '../client')));

// ── Serve landing page at '/' ──
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ── Connect to MongoDB ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Successfully connected to MongoDB!'))
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

// ── Helper: generate a unique 8-character uppercase room code ──
async function generateUniqueRoomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code;
  let exists = true;

  while (exists) {
    code = Array.from({ length: 8 }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join('');

    // Check if this code already exists in the database
    const existingGame = await Game.findOne({ roomCode: code });
    exists = !!existingGame;
  }

  return code;
}

// ── POST /api/create-game ──
app.post('/api/create-game', async (req, res) => {
  const { playerName } = req.body;

  if (!playerName || !playerName.trim()) {
    return res.status(400).json({ error: 'Player name is required.' });
  }

  try {
    // Generate a unique room code
    const roomCode = await generateUniqueRoomCode();

    // Generate a unique player ID for the host
    const playerId = uuidv4();

    // Create and save the game to MongoDB
    const newGame = new Game({
      roomCode,
      status: 'waiting',
      players: [
        {
          playerName: playerName.trim(),
          playerId,
          score: 0
        }
      ],
      currentRound: 1
    });

    await newGame.save();

    console.log(`🎮 Game created! Room code: ${roomCode} | Host: ${playerName}`);

    // Return the room code and playerId to the frontend
    res.status(201).json({ roomCode, playerId });

  } catch (err) {
    console.error('❌ Error creating game:', err.message);
    res.status(500).json({ error: 'Failed to create game. Please try again.' });
  }
});

// ── Start server ──
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
