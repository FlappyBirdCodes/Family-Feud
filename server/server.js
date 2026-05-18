const { setServers } = require('dns').promises;
setServers(['1.1.1.1', '8.8.8.8']);

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express          = require('express');
const http             = require('http');
const { Server }       = require('socket.io');
const mongoose         = require('mongoose');
const cors             = require('cors');
const path             = require('path');
const { v4: uuidv4 }  = require('uuid');
const Game             = require('./models/Game');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' }
});

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

    const existingGame = await Game.findOne({ roomCode: code });
    exists = !!existingGame;
  }

  return code;
}

// ── Dummy question for Phase 1 testing ──
const dummyQuestion = {
  question: 'Name something you would find in a kitchen.',
  answers: [
    { text: 'Refrigerator', points: 42 },
    { text: 'Stove',        points: 28 },
    { text: 'Sink',         points: 12 },
    { text: 'Microwave',    points: 8  },
    { text: 'Toaster',      points: 4  },
    { text: 'Cutting Board',points: 3  },
    { text: 'Knife',        points: 2  },
    { text: 'Dish Soap',    points: 1  }
  ]
};

// ── In-memory tracker: how many sockets are in each game room ──
const roomConnections = {};

// ── In-memory store: current round state per room ──
const roomState = {};

// ── Socket.IO ──
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on('join-room', (roomCode) => {
    socket.join(roomCode);
    console.log(`📥 Socket ${socket.id} joined room: ${roomCode}`);

    // Track connections per room
    if (!roomConnections[roomCode]) roomConnections[roomCode] = 0;
    roomConnections[roomCode]++;

    console.log(`👥 Room ${roomCode} now has ${roomConnections[roomCode]} socket(s)`);

    // If a round is already in progress, catch this socket up immediately
    if (roomState[roomCode]) {
      console.log(`🔄 Catching up late joiner in room ${roomCode}`);
      socket.emit('round-start', roomState[roomCode]);
      return;
    }

    // When both players are on game.html, kick off round 1
    if (roomConnections[roomCode] === 2) {
      console.log(`🎯 Both players in room ${roomCode} — emitting round-start!`);

      const roundData = { round: 1, question: dummyQuestion };

      // Store the round state in memory
      roomState[roomCode] = roundData;

      io.to(roomCode).emit('round-start', roundData);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// ── POST /api/create-game ──
app.post('/api/create-game', async (req, res) => {
  const { playerName } = req.body;

  if (!playerName || !playerName.trim()) {
    return res.status(400).json({ error: 'Player name is required.' });
  }

  try {
    const roomCode = await generateUniqueRoomCode();
    const playerId = uuidv4();

    const newGame = new Game({
      roomCode,
      status: 'waiting',
      players: [{ playerName: playerName.trim(), playerId, score: 0 }],
      currentRound: 1
    });

    await newGame.save();

    console.log(`🎮 Game created! Room: ${roomCode} | Host: ${playerName}`);

    res.status(201).json({ roomCode, playerId });

  } catch (err) {
    console.error('❌ Error creating game:', err.message);
    res.status(500).json({ error: 'Failed to create game. Please try again.' });
  }
});

// ── POST /api/join-game ──
app.post('/api/join-game', async (req, res) => {
  const { playerName, roomCode } = req.body;

  if (!playerName || !playerName.trim()) {
    return res.status(400).json({ error: 'Player name is required.' });
  }

  if (!roomCode || roomCode.trim().length !== 8) {
    return res.status(400).json({ error: 'A valid room code is required.' });
  }

  try {
    const game = await Game.findOne({ roomCode: roomCode.trim().toUpperCase() });

    // Check 1: does the room exist?
    if (!game) {
      return res.status(404).json({ error: 'Room not found. Please check the code and try again.' });
    }

    // Check 2: has the game already started?
    if (game.status === 'in-progress') {
      return res.status(400).json({ error: 'This game has already started.' });
    }

    // Check 3: is the room full?
    if (game.players.length >= 2) {
      return res.status(400).json({ error: 'This room is full.' });
    }

    // All checks passed — add the joining player
    const playerId = uuidv4();

    game.players.push({ playerName: playerName.trim(), playerId, score: 0 });
    game.status = 'in-progress';
    await game.save();

    console.log(`🎮 Player joined! Room: ${roomCode} | Player: ${playerName}`);
    console.log(`🚀 Game starting! Room: ${roomCode}`);

    // Emit game-start to everyone in the socket room
    // Pass both player names so the game page can display them
    const players = game.players.map(p => ({ playerName: p.playerName, playerId: p.playerId }));
    io.to(game.roomCode).emit('game-start', { players });

    res.status(200).json({ roomCode: game.roomCode, playerId });

  } catch (err) {
    console.error('❌ Error joining game:', err.message);
    res.status(500).json({ error: 'Failed to join game. Please try again.' });
  }
});

// ── GET /api/game/:roomCode ──
app.get('/api/game/:roomCode', async (req, res) => {
  try {
    const game = await Game.findOne({ roomCode: req.params.roomCode.toUpperCase() });

    if (!game) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    res.status(200).json({
      roomCode: game.roomCode,
      status: game.status,
      currentRound: game.currentRound,
      players: game.players.map(p => ({
        playerName: p.playerName,
        playerId: p.playerId,
        score: p.score
      }))
    });

  } catch (err) {
    console.error('❌ Error fetching game:', err.message);
    res.status(500).json({ error: 'Failed to fetch game data.' });
  }
});

// ── Start server ──
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
