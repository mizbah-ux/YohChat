// app.js (corrected)
const socket = io('http://localhost:3000'); // or just io() if same origin
const messagesDiv = document.getElementById('messages');
const input = document.getElementById('messageInput');
const typingDiv = document.getElementById('typingIndicator');
let typingTimeout;
const senderInput = document.getElementById('sender');
const usersList = document.getElementById('onlineUsers');
const currentChatLabel = document.getElementById('currentChatLabel');
const backToPublicBtn = document.getElementById('backToPublicBtn');

let currentUserId = null;       // username of this client
let activeChat = 'public';      // 'public' or 'private'
let publicMessages = [];      // all public chat messages
let privateMessages = {};     // { username: [ {sender, text, time}, ... ] }
let activeRecipient = null;     // username when in private chat

// ----- Chat history on connect -----
socket.on('chatHistory', (messages) => {
  messages.forEach((msg) => {
    addMessage(msg.sender, msg.content, msg.timestamp);
  });
});

// ----- Public message received -----
socket.on('receiveMessage', (data) => {
  addMessage(data.sender, data.content, data.timestamp);
});

// ----- Private DM received -----
socket.on('receive_private_message', (data) => {
  // If we're currently in a private chat with this sender or it's from ourselves, show it
  const isFromMe = data.sender === currentUserId;
  const shouldShowInCurrent = activeChat === 'public' ? false : (activeRecipient === data.sender || isFromMe);

  // Simple behavior: if in private with that user, show only in messages; if in public, show system note
  if (activeChat === 'private') {
    // if it's relevant to this private chat, show it
    if (activeRecipient === data.sender || isFromMe) {
      addDMMessage(data.sender, data.message, data.timestamp);
    } else {
      // optionally: notify user visually (not implemented here)
      console.log('Private message from', data.sender);
    }
  } else {
    // not in a private chat -> show a system-styled DM message in the public feed
    addDMMessage(data.sender, data.message, data.timestamp);
  }
});

// ----- Typing indicators -----
socket.on('userTyping', (senderName) => {
  typingDiv.textContent = `${senderName} is typing...`;
});
socket.on('userStopTyping', () => {
  typingDiv.textContent = '';
});

// ----- User list updates -----
socket.on('updateUserList', (users) => {
  usersList.innerHTML = '';
  users.forEach(user => {
    // skip self when rendering
    if (user === currentUserId) return;

    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = user;
    li.style.cursor = 'pointer';

    li.addEventListener('click', () => {
      // Set active private chat
      activeChat = 'private';
      activeRecipient = user;
      currentChatLabel.innerHTML = `<i class="ri-chat-private-line"></i>: ${user}`;
      backToPublicBtn.style.display = 'inline-block';
      messagesDiv.innerHTML = '';
      const sys = document.createElement('div');
      sys.className = 'message system';
      sys.textContent = `Private chat with ${user}`;
      messagesDiv.appendChild(sys);
      // load previous DM history if available
      if (privateMessages[user]) {
      privateMessages[user].forEach(m => addDMMessage(m.sender, m.text, m.time, user));
        }

    });

    usersList.appendChild(li);
  });
});

// ----- Input typing emit -----
input.addEventListener('input', () => {
  if (!currentUserId) return;
  socket.emit('typing', currentUserId);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stopTyping', currentUserId);
  }, 1000);
});

// ----- Send message (wired to form) -----
function sendMessage() {
  const sender = senderInput.value.trim();
  const msg = input.value.trim();
  if (!sender) { alert('Please enter your name first!'); return; }
  if (msg === '') return;

  if (activeChat === 'public') {
    socket.emit('sendMessage', { sender, content: msg });
  } else if (activeChat === 'private' && activeRecipient) {
    socket.emit('private_message', {
      sender: currentUserId,
      recipientId: activeRecipient,
      message: msg
    });

    // locally show the outgoing DM
    addDMMessage(currentUserId, msg, new Date().toISOString());
  }

  input.value = '';
}

// ----- Display helpers -----
function addMessage(sender, text, time) {
  const div = document.createElement('div');
  div.className = sender === currentUserId ? 'message me' : 'message other';
  div.textContent = `${sender}: ${text}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // store in history
  publicMessages.push({ sender, text, time });
}

function addDMMessage(sender, text, time, partner) {
  const div = document.createElement('div');
  div.className = sender === currentUserId ? 'message me' : 'message other';
  div.textContent = `${sender}: ${text}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // store per-user history
  if (!privateMessages[partner]) privateMessages[partner] = [];
  privateMessages[partner].push({ sender, text, time });
}

// ----- Join chat (called from UI) -----
function joinChat() {
  const username = senderInput.value.trim();
  if (!username) { alert('Enter your name first!'); return; }
  currentUserId = username;
  socket.emit('joinChat', username);
  senderInput.disabled = true;
  document.getElementById('joinBtn').disabled = true;
}

// ----- Switch back to public chat -----
function switchToPublic() {
  activeChat = 'public';
  activeRecipient = null;
  currentChatLabel.textContent = 'Public Room';
  backToPublicBtn.style.display = 'none';
  messagesDiv.innerHTML = '';

  // reload stored public messages
  publicMessages.forEach(m => addMessage(m.sender, m.text, m.time));
}


// Expose sendMessage globally if used by inline onclick
window.sendMessage = sendMessage;
window.joinChat = joinChat;
window.switchToPublic = switchToPublic;