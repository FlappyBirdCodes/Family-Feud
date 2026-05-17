const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  playerName: { type: String, required: true },
  playerId:   { type: String, required: true },
  score:      { type: Number, default: 0 }
});

const gameSchema = new mongoose.Schema({
  roomCode:     { type: String, required: true, unique: true },
  status:       { type: String, enum: ['waiting', 'in-progress'], default: 'waiting' },
  players:      { type: [playerSchema], default: [] },
  currentRound: { type: Number, default: 1 }
});

module.exports = mongoose.model('Game', gameSchema);
