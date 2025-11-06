// server.js (corrected)
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public'));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

mongoose.connect('mongodb://127.0.0.1:27017/yohchat')
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  sender: String,
  content: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const SECRET_KEY = "mySecretKey";

// --- In-memory maps for quick lookup (for demo/testing)
let onlineUsers = {};         // { socketId: username }
let socketsByName = {};      // { username: socketId }

// Middleware and routes omitted for brevity (keep your register/login routes here)
// ... your /api/register, /api/login, verifyToken etc. (unchanged) ...

io.on('connection', (socket) => {
  console.log('🟢 User connected:', socket.id);

  // Send last messages on connect
  Message.find().sort({ timestamp: 1 }).limit(20)
    .then(messages => {
      socket.emit('chatHistory', messages);
    });

  // --- User joins chat with a name ---
  socket.on('joinChat', (username) => {
    onlineUsers[socket.id] = username;
    socketsByName[username] = socket.id;
    console.log(`${username} joined the chat (${socket.id})`);
    io.emit('updateUserList', Object.values(onlineUsers));
  });

  // --- Typing notifications (top-level handlers) ---
  socket.on('typing', (senderName) => {
    socket.broadcast.emit('userTyping', senderName);
  });

  socket.on('stopTyping', (senderName) => {
    socket.broadcast.emit('userStopTyping', senderName);
  });

  // --- Public message handler ---
  socket.on('sendMessage', async (data) => {
    try {
      const newMessage = new Message({ sender: data.sender, content: data.content });
      await newMessage.save();
      io.emit('receiveMessage', newMessage);
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  // --- Private 1:1 DM handler (deliver to recipient socket directly) ---
  socket.on('private_message', ({ sender, recipientId, message }) => {
    // recipientId is the username (as used in UI)
    const recipientSocketId = socketsByName[recipientId];
    const senderSocketId = socket.id;

    const payload = {
      sender,
      message,
      timestamp: new Date().toISOString()
    };

    // send to recipient if online
    if (recipientSocketId && recipientSocketId !== socket.id) {
      io.to(recipientSocketId).emit('receive_private_message', payload);
    }
    // sender already adds it locally
    // Optionally also send to sender so they see their outgoing DM in their own UI
  });

  // --- Private group room handlers (optional) ---
  socket.on('join_private_room', ({ roomId, userId }) => {
    socket.join(roomId);
    io.to(roomId).emit('system_message', `${userId} joined private room ${roomId}`);
  });

  socket.on('private_room_message', ({ roomId, sender, message }) => {
    io.to(roomId).emit('receive_private_room_message', {
      sender,
      message,
      timestamp: new Date().toISOString()
    });
  });

  // --- Disconnect cleanup ---
  socket.on('disconnect', () => {
    const username = onlineUsers[socket.id];
    console.log('🔴 User disconnected:', username || socket.id);

    // remove from both maps
    if (username) {
      delete socketsByName[username];
    }
    delete onlineUsers[socket.id];

    io.emit('updateUserList', Object.values(onlineUsers));
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
