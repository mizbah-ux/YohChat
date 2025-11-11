const socket = io('http://localhost:3000');
const messagesDiv = document.getElementById('messages');
const input = document.getElementById('messageInput');
const typingDiv = document.getElementById('typingIndicator');
const senderInput = document.getElementById('sender');
const usersList = document.getElementById('onlineUsers');
const currentChatLabel = document.getElementById('currentChatLabel');
const backToPublicBtn = document.getElementById('backToPublicBtn');
let typingTimeout;

let currentUserId = null;
let activeChat = 'public';
let activeRecipient = null;
let publicMessages = [];
let privateMessages = {};
let unreadUsers = new Set();

// Chat history
socket.on('chatHistory', (messages) => {
  messages.forEach(msg => addMessage(msg.sender, msg.content, msg.timestamp));
});

// Public chat messages
socket.on('receiveMessage', (data) => {
  addMessage(data.sender, data.content, data.timestamp);
});

// Private message receive
socket.on('receive_private_message', (data) => {
  const isFromMe = data.sender === currentUserId;
  const isRelevant = activeChat === 'private' && activeRecipient === data.sender;

  if (isFromMe || isRelevant) {
    addDMMessage(data.sender, data.message, data.timestamp);
  } else {
    unreadUsers.add(data.sender);
    updateUserListHighlight();
  }
});

// Private chat history
socket.on('private_history', (messages) => {
  messagesDiv.innerHTML = '';
  const sys = document.createElement('div');
  sys.className = 'message system';
  sys.textContent = `Private chat loaded`;
  messagesDiv.appendChild(sys);

  messages.forEach(m => addDMMessage(m.sender, m.content, m.timestamp, m.receiver));
});

// Typing indicators
socket.on('userTyping', (senderName) => {
  typingDiv.textContent = `${senderName} is typing...`;
});
socket.on('userStopTyping', () => typingDiv.textContent = '');

// Online/offline status — only inside private chat
socket.on('userOnline', ({ username }) => {
  if (activeChat === 'private' && activeRecipient === username) {
    const statusMsg = document.createElement('div');
    statusMsg.className = 'message system small text-success';
    statusMsg.textContent = `${username} is online now`;
    messagesDiv.appendChild(statusMsg);
  }
});

socket.on('userOffline', ({ username, lastSeen }) => {
  if (activeChat === 'private' && activeRecipient === username) {
    const statusMsg = document.createElement('div');
    statusMsg.className = 'message system small text-muted';
    statusMsg.textContent = `Last seen: ${formatLastSeen(lastSeen)}`;
    messagesDiv.appendChild(statusMsg);
  }
});

// User list updates
socket.on('updateUserList', (users) => {
  usersList.innerHTML = '';
  users.forEach(user => {
    if (user === currentUserId) return;

    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = user;

    li.addEventListener('click', () => {
      activeChat = 'private';
      activeRecipient = user;
      unreadUsers.delete(user);
      updateUserListHighlight();
      currentChatLabel.innerHTML = `<i class="ri-chat-private-line"></i>: ${user}`;
      backToPublicBtn.style.display = 'inline-block';
      messagesDiv.innerHTML = '';

      const sys = document.createElement('div');
      sys.className = 'message system';
      sys.textContent = `Private chat with ${user}`;
      messagesDiv.appendChild(sys);

      fetch(`/api/lastseen/${user}`)
        .then(res => res.json())
        .then(data => {
          const info = document.createElement('div');
          info.className = 'message system small text-muted';
          info.textContent = `Last seen: ${formatLastSeen(data.lastSeen)}`;
          messagesDiv.appendChild(info);
        });

      socket.emit('fetch_private_history', { userA: currentUserId, userB: user });
    });

    usersList.appendChild(li);
  });
});

// Input typing
input.addEventListener('input', () => {
  if (!currentUserId) return;
  socket.emit('typing', currentUserId);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit('stopTyping', currentUserId), 1000);
});

// Send message
function sendMessage() {
  const sender = senderInput.value.trim();
  const msg = input.value.trim();
  if (!sender) return alert('Enter your name first!');
  if (msg === '') return;

  if (activeChat === 'public') {
    socket.emit('sendMessage', { sender, content: msg });
  } else if (activeChat === 'private' && activeRecipient) {
    socket.emit('private_message', { sender: currentUserId, recipientId: activeRecipient, message: msg });
    addDMMessage(currentUserId, msg, new Date().toISOString());
  }
  input.value = '';
}

// ----- Public message -----
function addMessage(sender, text, time, delivered = true, read = false) {
  const div = document.createElement('div');
  div.className = sender === currentUserId ? 'message me' : 'message other';

  const nameTag = document.createElement('div');
  nameTag.className = 'msg-sender';
  nameTag.textContent = sender;

  const msgContent = document.createElement('div');
  msgContent.className = 'msg-bubble';
  msgContent.innerHTML = `<span>${text}</span>`;

  // Timestamp
  const timeSpan = document.createElement('span');
  timeSpan.className = 'msg-time';
  timeSpan.textContent = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  msgContent.appendChild(timeSpan);

  // Ticks for my messages
  if (sender === currentUserId) {
    const ticks = document.createElement('span');
    ticks.className = 'msg-status';
    ticks.innerHTML = read
      ? '<i class="ri-check-double-line text-primary"></i>'
      : delivered
      ? '<i class="ri-check-double-line text-light"></i>'
      : '<i class="ri-check-line text-light"></i>';
    msgContent.appendChild(ticks);
  }

  div.appendChild(nameTag);
  div.appendChild(msgContent);
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ----- Private message -----
function addDMMessage(sender, text, time, partner, delivered = true, read = false) {
  const div = document.createElement('div');
  div.className = sender === currentUserId ? 'message me' : 'message other';

  if (sender !== currentUserId) {
    const nameTag = document.createElement('div');
    nameTag.className = 'msg-sender';
    nameTag.textContent = sender;
    div.appendChild(nameTag);
  }

  const msgContent = document.createElement('div');
  msgContent.className = 'msg-bubble';
  msgContent.innerHTML = `<span>${text}</span>`;

  // Timestamp
  const timeSpan = document.createElement('span');
  timeSpan.className = 'msg-time';
  timeSpan.textContent = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  msgContent.appendChild(timeSpan);

  // Ticks for my messages
  if (sender === currentUserId) {
    const ticks = document.createElement('span');
    ticks.className = 'msg-status';
    ticks.innerHTML = read
      ? '<i class="ri-check-double-line text-primary"></i>'
      : delivered
      ? '<i class="ri-check-double-line text-light"></i>'
      : '<i class="ri-check-line text-light"></i>';
    msgContent.appendChild(ticks);
  }

  div.appendChild(msgContent);
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  if (!privateMessages[partner]) privateMessages[partner] = [];
  privateMessages[partner].push({ sender, text, time });
}


function updateUserListHighlight() {
  const items = document.querySelectorAll('#onlineUsers li');
  items.forEach(li => {
    const name = li.textContent.replace('•', '').trim();
    if (unreadUsers.has(name)) li.innerHTML = `${name} <span style="color:deepskyblue;">•</span>`;
    else li.textContent = name;
  });
}

// Join chat
function joinChat() {
  const username = senderInput.value.trim();
  if (!username) return alert('Enter your name first!');
  currentUserId = username;
  socket.emit('joinChat', username);
  senderInput.disabled = true;
  document.getElementById('joinBtn').disabled = true;
}

// Switch back to public
function switchToPublic() {
  activeChat = 'public';
  activeRecipient = null;
  currentChatLabel.textContent = 'Public Room';
  backToPublicBtn.style.display = 'none';
  messagesDiv.innerHTML = '';

  // 🔹 Rebuild from saved history or refetch
  if (publicMessages.length > 0) {
    publicMessages.forEach(m => addMessage(m.sender, m.content || m.text, m.timestamp || m.time));
  } else {
    socket.emit('fetch_public_history');
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}


// Format last seen
function formatLastSeen(dateString) {
  const date = new Date(dateString);
  if (isNaN(date)) return "unavailable";
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  if (diffSec < 60) return "just a while ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays > 1 && diffDays <= 2) return "2 days ago";
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

window.sendMessage = sendMessage;
window.joinChat = joinChat;
window.switchToPublic = switchToPublic;
