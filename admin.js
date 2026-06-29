// Socket.io connection
const socket = io({
    query: {
        userId: localStorage.getItem('userId'),
        sessionId: localStorage.getItem('sessionId')
    }
});

let currentUserId = localStorage.getItem('userId');
let currentRole = localStorage.getItem('role');
let selectedStudentId = null;

// Socket event handlers
socket.on('connect', () => {
    console.log('Admin connected to server');
});

socket.on('session_invalid', (data) => {
    alert(data.message);
    localStorage.clear();
    window.location.href = '/';
});

socket.on('new_message', (message) => {
    if (message.chatType === 'group') {
        appendMessage(message, 'adminGroupMessages');
    } else if (message.chatType === 'private') {
        if (selectedStudentId && (message.sender._id === selectedStudentId || message.recipient === selectedStudentId)) {
            appendMessage(message, 'adminPrivateMessages');
        }
    }
});

socket.on('disconnect', () => {
    console.log('Admin disconnected from server');
});

// Panel switching
function showPanel(panelId) {
    // Update tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.panel === panelId) {
            tab.classList.add('active');
        }
    });

    // Update panels
    document.querySelectorAll('.admin-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(panelId).classList.add('active');

    // Load content based on panel
    if (panelId === 'users') {
        loadUsers();
    } else if (panelId === 'courses') {
        loadCourses();
    } else if (panelId === 'settings') {
        loadSettings();
    } else if (panelId === 'group-chat') {
        loadGroupMessages();
    } else if (panelId === 'private-chats') {
        loadStudentsList();
    }
}

// Load users
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const users = await response.json();
        
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';
        
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(user.username)}</td>
                <td>
                    <span class="status ${user.isBlocked ? 'blocked' : 'active'}" style="padding: 4px 8px; border-radius: 20px; font-size: 11px; background: ${user.isBlocked ? '#ffebee' : '#e8f5e9'}; color: ${user.isBlocked ? '#f44336' : '#4caf50'};">
                        ${user.isBlocked ? 'Blocked' : 'Active'}
                    </span>
                </td>
                <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}</td>
                <td>
                    <div class="user-actions">
                        <button class="block-btn" onclick="toggleBlock('${user._id}', ${user.isBlocked})">
                            <i class="fas fa-${user.isBlocked ? 'unlock' : 'ban'}"></i>
                            ${user.isBlocked ? 'Unblock' : 'Block'}
                        </button>
                        <button class="delete-btn" onclick="deleteUser('${user._id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Create user
async function createUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    
    if (!username || !password) {
        alert('Please fill in all fields');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('User created successfully!');
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
            loadUsers();
        } else {
            alert(data.error || 'Error creating user');
        }
    } catch (error) {
        console.error('Error creating user:', error);
        alert('Error creating user');
    }
}

// Toggle block user
async function toggleBlock(userId, isBlocked) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/block`, {
            method: 'PATCH'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`User ${data.isBlocked ? 'blocked' : 'unblocked'} successfully`);
            loadUsers();
        } else {
            alert(data.error || 'Error updating user');
        }
    } catch (error) {
        console.error('Error toggling block:', error);
        alert('Error updating user');
    }
}

// Delete user
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('User deleted successfully');
            loadUsers();
        } else {
            alert(data.error || 'Error deleting user');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Error deleting user');
    }
}

// Load courses
async function loadCourses() {
    try {
        const response = await fetch('/api/admin/courses');
        const courses = await response.json();
        
        const container = document.getElementById('coursesList');
        container.innerHTML = '';
        
        courses.forEach(course => {
            const card = document.createElement('div');
            card.className = `course-card ${!course.isActive ? 'inactive' : ''}`;
            card.innerHTML = `
                <h4>${escapeHtml(course.title)}</h4>
                <p class="course-description">${escapeHtml(course.description.substring(0, 100))}${course.description.length > 100 ? '...' : ''}</p>
                <div class="course-meta">
                    <span>${escapeHtml(course.level)}</span>
                    <span>${escapeHtml(course.duration || 'N/A')}</span>
                    <span>${escapeHtml(course.instructor || 'N/A')}</span>
                </div>
                <div class="course-price">₹${course.pricing}</div>
                <div class="course-actions">
                    <button class="edit-btn" onclick="editCourse('${course._id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="toggle-btn" onclick="toggleCourse('${course._id}', ${course.isActive})">
                        <i class="fas fa-${course.isActive ? 'eye-slash' : 'eye'}"></i>
                        ${course.isActive ? 'Hide' : 'Show'}
                    </button>
                    <button class="delete-btn" onclick="deleteCourse('${course._id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading courses:', error);
    }
}

// Create course
async function createCourse() {
    const title = document.getElementById('courseTitle').value.trim();
    const description = document.getElementById('courseDescription').value.trim();
    const pricing = document.getElementById('coursePrice').value;
    const categories = document.getElementById('courseCategories').value.trim();
    const videoUrl = document.getElementById('courseVideoUrl').value.trim();
    const documentUrl = document.getElementById('courseDocumentUrl').value.trim();
    const instructor = document.getElementById('courseInstructor').value.trim();
    const duration = document.getElementById('courseDuration').value.trim();
    const level = document.getElementById('courseLevel').value;
    
    if (!title || !description || !pricing) {
        alert('Please fill in title, description, and price');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/courses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                description,
                pricing: parseFloat(pricing),
                categories,
                videoUrl,
                documentUrl,
                instructor,
                duration,
                level
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Course created successfully!');
            // Clear form
            document.getElementById('courseTitle').value = '';
            document.getElementById('courseDescription').value = '';
            document.getElementById('coursePrice').value = '';
            document.getElementById('courseCategories').value = '';
            document.getElementById('courseVideoUrl').value = '';
            document.getElementById('courseDocumentUrl').value = '';
            document.getElementById('courseInstructor').value = '';
            document.getElementById('courseDuration').value = '';
            document.getElementById('courseLevel').value = 'beginner';
            
            loadCourses();
        } else {
            alert(data.error || 'Error creating course');
        }
    } catch (error) {
        console.error('Error creating course:', error);
        alert('Error creating course');
    }
}

// Toggle course visibility
async function toggleCourse(courseId, isActive) {
    try {
        const response = await fetch(`/api/admin/courses/${courseId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isActive: !isActive })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Course ${!isActive ? 'shown' : 'hidden'} successfully`);
            loadCourses();
        } else {
            alert(data.error || 'Error updating course');
        }
    } catch (error) {
        console.error('Error toggling course:', error);
        alert('Error updating course');
    }
}

// Delete course
async function deleteCourse(courseId) {
    if (!confirm('Are you sure you want to delete this course?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/courses/${courseId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Course deleted successfully');
            loadCourses();
        } else {
            alert(data.error || 'Error deleting course');
        }
    } catch (error) {
        console.error('Error deleting course:', error);
        alert('Error deleting course');
    }
}

// Edit course (placeholder for future implementation)
function editCourse(courseId) {
    alert('Edit functionality coming soon!');
}

// Load settings
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        
        document.getElementById('sessionTitle').value = settings.sessionTitle || '';
        document.getElementById('googleMeetLink').value = settings.googleMeetLink || '';
        
        if (settings.nextSessionDate) {
            const date = new Date(settings.nextSessionDate);
            document.getElementById('nextSessionDate').value = date.toISOString().slice(0, 16);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Save settings
async function saveSettings() {
    const sessionTitle = document.getElementById('sessionTitle').value.trim();
    const googleMeetLink = document.getElementById('googleMeetLink').value.trim();
    const nextSessionDate = document.getElementById('nextSessionDate').value;
    
    try {
        const response = await fetch('/api/settings', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionTitle,
                googleMeetLink,
                nextSessionDate
            })
        });
        
        const data = await response.json();
        
        if (data) {
            alert('Settings saved successfully!');
        } else {
            alert('Error saving settings');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Error saving settings');
    }
}

// Load group messages
async function loadGroupMessages() {
    try {
        const response = await fetch('/api/messages/group');
        const messages = await response.json();
        
        const container = document.getElementById('adminGroupMessages');
        container.innerHTML = '';
        
        messages.forEach(message => {
            appendMessage(message, 'adminGroupMessages');
        });
        
        scrollToBottom('adminGroupMessages');
    } catch (error) {
        console.error('Error loading group messages:', error);
    }
}

// Load students list for private chat
async function loadStudentsList() {
    try {
        const response = await fetch('/api/admin/users');
        const users = await response.json();
        
        const container = document.getElementById('studentsList');
        container.innerHTML = '';
        
        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'student-card';
            card.dataset.userId = user._id;
            card.onclick = () => selectStudent(user._id, user.username);
            card.innerHTML = `
                <h4>${escapeHtml(user.username)}</h4>
                <p>${user.isBlocked ? 'Blocked' : 'Active'}</p>
                <span class="status ${user.socketId ? 'online' : 'offline'}">
                    ${user.socketId ? 'Online' : 'Offline'}
                </span>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading students:', error);
    }
}

// Select student for private chat
function selectStudent(userId, username) {
    selectedStudentId = userId;
    
    // Update UI
    document.querySelectorAll('.student-card').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.userId === userId) {
            card.classList.add('active');
        }
    });
    
    // Show chat container
    document.getElementById('privateChatContainer').style.display = 'flex';
    document.getElementById('noChatSelected').style.display = 'none';
    
    // Load private messages
    loadPrivateMessages(userId);
}

// Load private messages for selected student
async function loadPrivateMessages(userId) {
    try {
        const response = await fetch(`/api/messages/private/${userId}`);
        const messages = await response.json();
        
        const container = document.getElementById('adminPrivateMessages');
        container.innerHTML = '';
        
        messages.forEach(message => {
            appendMessage(message, 'adminPrivateMessages');
        });
        
        scrollToBottom('adminPrivateMessages');
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
                ${message.sender.role === 'admin' ? '<i class="fas fa-shield-alt"></i>' : ''}
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
    const inputId = chatType === 'group' ? 'adminGroupInput' : 'adminPrivateInput';
    const input = document.getElementById(inputId);
    const content = input.value.trim();
    
    if (!content) return;
    
    let recipientId = null;
    if (chatType === 'private') {
        recipientId = selectedStudentId;
        if (!recipientId) {
            alert('Please select a student first');
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
    loadUsers();
});

// Handle session invalidation
window.addEventListener('storage', (e) => {
    if (e.key === 'sessionId' && e.newValue !== e.oldValue) {
        alert('Your session has been invalidated. Please login again.');
        window.location.href = '/';
    }
});
