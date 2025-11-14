require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// ✅ Import models and routes
const User = require('./models/User');
const authRoutes = require('./routes/auth');   // <--- THIS was missing

// ✅ Initialize express app
const app = express();
app.use(express.static('public'));
app.use(express.json());

// ✅ Use authentication routes
app.use('/api/auth', authRoutes);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ---- JWT AUTH FOR SOCKET.IO ----
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("No token provided"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;  // store user data for later use
    next();
  } catch (err) {
    console.error("JWT Error:", err);
    next(new Error("Invalid token"));
  }
});


// ✅ MongoDB connection
mongoose.connect('mongodb://127.0.0.1:27017/yohchat')
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  sender: String,
  content: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const privateMessageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
  isRead: { type: Boolean, default: false }
});
const PrivateMessage = mongoose.model('PrivateMessage', privateMessageSchema);

let onlineUsers = {};
let socketsByName = {};

io.on('connection', (socket) => {
  const userName = socket.user.name;  // username taken from JWT token

  console.log(`🟢 ${userName} connected`);

  // Send last 20 messages (latest first)
  Message.find().sort({ timestamp: -1 }).limit(20)
  .then(messages => {
    // Reverse before sending so newest messages appear at the bottom
    socket.emit('chatHistory', messages.reverse());
  })
  .catch(err => console.error('Error loading chat history:', err));


    socket.on('joinChat', async () => {
    const username = socket.user.name;   // use authenticated username

    onlineUsers[socket.id] = username;
    socketsByName[username] = socket.id;
    console.log(`${username} joined (${socket.id})`);
    io.emit('updateUserList', Object.values(onlineUsers));
    socket.broadcast.emit('userOnline', { username });
  });

  socket.on('sendMessage', async (data) => {
    const msg = new Message({ sender: data.sender, content: data.content });
    await msg.save();
    io.emit('receiveMessage', msg);
  });

  socket.on('private_message', async ({ sender, recipientId, message }) => {
    const recipientSocketId = socketsByName[recipientId];
    await PrivateMessage.create({ sender, receiver: recipientId, content: message });
    const payload = { sender, message, timestamp: new Date().toISOString() };
    if (recipientSocketId) io.to(recipientSocketId).emit('receive_private_message', payload);
  });

  socket.on('fetch_private_history', async ({ userA, userB }) => {
    const messages = await PrivateMessage.find({
      $or: [{ sender: userA, receiver: userB }, { sender: userB, receiver: userA }]
    }).sort({ timestamp: 1 });
    await PrivateMessage.updateMany({ receiver: userA, sender: userB, isRead: false }, { $set: { isRead: true } });
    socket.emit('private_history', messages);
  });

  socket.on('typing', (senderName) => socket.broadcast.emit('userTyping', senderName));
  socket.on('stopTyping', (senderName) => socket.broadcast.emit('userStopTyping', senderName));

  socket.on('disconnect', async () => {
    const username = onlineUsers[socket.id];
    console.log('🔴 User disconnected:', username);
    if (username) {
      await User.updateOne({ name: username }, { lastSeen: new Date() });
      delete socketsByName[username];
    }
    delete onlineUsers[socket.id];
    io.emit('updateUserList', Object.values(onlineUsers));
    io.emit('userOffline', { username, lastSeen: new Date() });
  });
});

app.get('/api/lastseen/:username', async (req, res) => {
  const user = await User.findOne({ name: req.params.username });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ lastSeen: user.lastSeen || new Date() });
});

server.listen(3000, () => console.log(`🚀 Server running on http://localhost:3000`));
