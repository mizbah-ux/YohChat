

1. Introduction
This document explains, step-by-step, the design and implementation of a real-time chat application.
The app supports both public chat (visible to everyone) and private direct messages (DMs) between
users. It is built using Node.js, Express.js, Socket.IO for real-time communication, MongoDB for
message persistence, and Bootstrap for the frontend layout. The content includes conceptual
explanations and code snippets for each important part of the project.


2. Tools & Technologies:

- Node.js: JavaScript runtime for server-side code.
- Express.js: Web framework for building HTTP/API routes.
- Socket.IO: Real-time bi-directional communication between client and server.
- MongoDB with Mongoose: Document database and ORM for message persistence.
- Bootstrap: Frontend CSS framework for responsive layout.
- JavaScript (ES6): Client-side and server-side scripting.


3. High-level Architecture:

The application follows a client-server model. The client is a browser that loads the chat UI and
connects to the server through a persistent WebSocket-like connection provided by Socket.IO. The
server (Node.js + Express) handles HTTP API routes (optional authentication, register/login) and
manages Socket.IO events for real-time messaging. MongoDB stores message history.


4. Data Models (MongoDB)

A simple message document model used in MongoDB (Mongoose):
    const messageSchema = new mongoose.Schema({
     sender: String,
     content: String,
     timestamp: { type: Date, default: Date.now }
    });
    const Message = mongoose.model('Message', messageSchema);


5. Server: Express + Socket.IO (concept):

    const express = require('express');
    const http = require('http');
    const { Server } = require('socket.io');
    const mongoose = require('mongoose');
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);
    let onlineUsers = {};
    let socketsByName = {}; 
    io.on('connection', (socket) => {
     socket.on('joinChat', (username) => {
     onlineUsers[socket.id] = username;
     socketsByName[username] = socket.id;
     io.emit('updateUserList', Object.values(onlineUsers));
     });
     socket.on('sendMessage', async (data) => {
     const newMessage = new Message({ sender: data.sender, content: data.content });
     await newMessage.save();
     io.emit('receiveMessage', newMessage);
     });
     socket.on('private_message', ({ sender, recipientId, message }) => {
     const recipientSocketId = socketsByName[recipientId];
     if (recipientSocketId && recipientSocketId !== socket.id) {
     io.to(recipientSocketId).emit('receive_private_message', { sender, message,
    timestamp: new Date().toISOString() });
     }
     });
     socket.on('disconnect', () => {
     const username = onlineUsers[socket.id];
     if (username) delete socketsByName[username];
     delete onlineUsers[socket.id];
     io.emit('updateUserList', Object.values(onlineUsers));
     });
    });


6. Client-side (app.js concept):

    const socket = io('http://localhost:3000');
    let currentUserId = null;
    let activeChat = 'public';
    let activeRecipient = null;
    function joinChat() {
     currentUserId = document.getElementById('sender').value.trim();
     socket.emit('joinChat', currentUserId);
    }
    socket.on('updateUserList', (users) => {
     // render user list and attach click handlers to open DM
    });
    function sendMessage() {
     const msg = document.getElementById('messageInput').value;
     if (activeChat === 'public') {
     socket.emit('sendMessage', { sender: currentUserId, content: msg   });
     } else {
     socket.emit('private_message', { sender: currentUserId, recipientId:
    activeRecipient, message: msg });
     }
    }


7. UX Features and Fixes:

Key improvements added to enhance user experience:
- Preserve public message history when switching between private chats.
- Prevent duplicate DMs on sender's side.
- Introduce a 'Back' button to return to public chat.
- Move typing indicators out of nested events for cleaner handling.


8. Future Enhancements:

- Add read receipts for messages.
- Persist private DMs in MongoDB.
- Introduce group chats and file uploads.
- Add user authentication and profile pictures.