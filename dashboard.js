// Socket.io connection
const socket = io({
    query: {
        userId: localStorage.getItem('userId'),
        sessionId: localStorage.getItem('sessionId')
    }
});

let currentUserId = localStorage.getItem('userId');
let currentRole = localStorage.getItem('role');
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('session_invalid', (data) => {
    alert(data.message);
    localStorage.clear();
    window.location.href = '/';
});

socket.on('new_message', (message) => {
    if (message.chatType === 'group') {
        appendMessage(message, 'groupMessages');
    } else if (message.chatType === 'private') {
        appendMessage(message, 'privateMessages');
    }
});

socket.on('user_typing', (data) => {
    console.log('User typing:', data.userId);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

// Panel switching
function showPanel(panelId) {
    // Update feature cards
    document.querySelectorAll('.feature-card').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.panel === panelId) {
            card.classList.add('active');
        }
    });

    // Update content panels
    document.querySelectorAll('.content-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(panelId).classList.add('active');

    // Load content based on panel
    if (panelId === 'live-session') {
        loadSessionInfo();
    } else if (panelId === 'group-chat') {
        loadGroupMessages();
    } else if (panelId === 'private-chat') {
        loadPrivateMessages();
    }
}

// Load session information
async function loadSessionInfo() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        const sessionTitle = document.getElementById('sessionTitle');
        const sessionDate = document.getElementById('sessionDate');
        const joinMeetBtn = document.getElementById('joinMeetBtn');

        if (settings.nextSessionDate) {
            const date = new Date(settings.nextSessionDate);
            sessionTitle.textContent = settings.sessionTitle || 'Sunday Live Session';
            sessionDate.textContent = date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            if (settings.googleMeetLink) {
                joinMeetBtn.style.display = 'inline-flex';
                joinMeetBtn.onclick = () => window.open(settings.googleMeetLink, '_blank');
            } else {
                joinMeetBtn.style.display = 'none';
            }
        } else {
            document.getElementById('sessionContent').innerHTML = `
                <div class="no-session">
                    <i class="fas fa-calendar-times"></i>
                    <p>No upcoming session scheduled</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading session info:', error);
    }
}

// Join Google Meet
function joinMeet() {
    window.open(document.getElementById('joinMeetBtn').dataset.url, '_blank');
}

// Load group messages
async function loadGroupMessages() {
    try {
        const response = await fetch('/api/messages/group');
        const messages = await response.json();
        
        const container = document.getElementById('groupMessages');
        container.innerHTML = '';
        
        messages.forEach(message => {
            appendMessage(message, 'groupMessages');
        });
        
        scrollToBottom('groupMessages');
    } catch (error) {
        console.error('Error loading group messages:', error);
    }
}

// Load private messages
async function loadPrivateMessages() {
    try {
        const response = await fetch(`/api/messages/private/${currentUserId}`);
        const messages = await response.json();
        
        const container = document.getElementById('privateMessages');
        container.innerHTML = '';
        
        messages.forEach(message => {
            appendMessage(message, 'privateMessages');
        });
        
        scrollToBottom('privateMessages');
    } catch (error) {
        console.error('Error loading private messages:', error);
    }
}

// Append message to chat
function appendMessage(message, containerId) {
    const container = document.getElementById(containerId);
    const isOwn = message.sender._id === currentUserId;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : ''}`;
    
    const avatarInitial = message.sender.username.charAt(0).toUpperCase();
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatarInitial}</div>
        <div class="message-content">
            <div class="message-header">
                ${!isOwn ? message.sender.username : 'You'}
            </div>
            <div class="message-bubble">${escapeHtml(message.content)}</div>
            <div class="message-time">${formatTime(message.timestamp)}</div>
        </div>
    `;
    
    container.appendChild(messageDiv);
    scrollToBottom(containerId);
}

// Send message
async function sendMessage(chatType) {
    const inputId = chatType === 'group' ? 'groupInput' : 'privateInput';
    const input = document.getElementById(inputId);
    const content = input.value.trim();
    
    if (!content) return;
    
    let recipientId = null;
    if (chatType === 'private') {
        // Get admin ID for private chat
        try {
            const response = await fetch('/api/admin/users');
            const users = await response.json();
            // For now, we'll send to admin - the server will handle this
            recipientId = 'admin'; // Server will resolve this
        } catch (error) {
            console.error('Error getting admin:', error);
            return;
        }
    }
    
    socket.emit('send_message', {
        chatType,
        content,
        recipientId
    });
    
    input.value = '';
}

// Handle enter key press
function handleKeyPress(event, chatType) {
    if (event.key === 'Enter') {
        sendMessage(chatType);
    }
}

// Scroll to bottom of chat
function scrollToBottom(containerId) {
    const container = document.getElementById(containerId);
    container.scrollTop = container.scrollHeight;
}

// Format time
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Logout
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        localStorage.clear();
        socket.disconnect();
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set welcome message
    const username = localStorage.getItem('username') || 'Student';
    document.getElementById('welcomeMessage').textContent = `Welcome back, ${username}!`;
    
    // Load initial content
    loadSessionInfo();
});

// Handle session invalidation
window.addEventListener('storage', (e) => {
    if (e.key === 'sessionId' && e.newValue !== e.oldValue) {
        alert('Your session has been invalidated. Please login again.');
        window.location.href = '/';
    }
});

// Voice recording functions
async function toggleVoiceRecording(chatType) {
    const voiceBtn = document.getElementById('voiceRecordBtn');
    
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const reader = new FileReader();
                
                reader.onloadend = async () => {
                    const base64Audio = reader.result;
                    sendVoiceMessage(chatType, base64Audio);
                };
                
                reader.readAsDataURL(audioBlob);
                
                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            isRecording = true;
            voiceBtn.classList.add('recording');
            voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please ensure you have granted permission.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        voiceBtn.classList.remove('recording');
        voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    }
}

// Send voice message
async function sendVoiceMessage(chatType, base64Audio) {
    let recipientId = null;
    if (chatType === 'private') {
        try {
            const response = await fetch('/api/admin/users');
            const users = await response.json();
            recipientId = 'admin';
        } catch (error) {
            console.error('Error getting admin:', error);
            return;
        }
    }
    
    socket.emit('send_message', {
        chatType,
        content: `[VOICE:${base64Audio}]`,
        recipientId
    });
}

// Enhanced append message to handle voice messages
function appendMessage(message, containerId) {
    const container = document.getElementById(containerId);
    const isOwn = message.sender._id === currentUserId;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : ''}`;
    
    const avatarInitial = message.sender.username.charAt(0).toUpperCase();
    
    // Check if message contains voice
    if (message.content.startsWith('[VOICE:') && message.content.endsWith(']')) {
        const base64Audio = message.content.slice(7, -1);
        messageDiv.innerHTML = `
            <div class="message-avatar">${avatarInitial}</div>
            <div class="message-content">
                <div class="message-header">
                    ${!isOwn ? message.sender.username : 'You'}
                </div>
                <div class="voice-message">
                    <audio controls src="${base64Audio}"></audio>
                    <span class="voice-duration"><i class="fas fa-microphone"></i> Voice Message</span>
                </div>
                <div class="message-time">${formatTime(message.timestamp)}</div>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="message-avatar">${avatarInitial}</div>
            <div class="message-content">
                <div class="message-header">
                    ${!isOwn ? message.sender.username : 'You'}
                </div>
                <div class="message-bubble">${escapeHtml(message.content)}</div>
                <div class="message-time">${formatTime(message.timestamp)}</div>
            </div>
        `;
    }
    
    container.appendChild(messageDiv);
    scrollToBottom(containerId);
}
