const loginForm = document.getElementById('loginForm');
const errorMessage = document.getElementById('errorMessage');

function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleBtn = document.querySelector('.toggle-password i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.classList.remove('fa-eye');
        toggleBtn.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleBtn.classList.remove('fa-eye-slash');
        toggleBtn.classList.add('fa-eye');
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const submitBtn = loginForm.querySelector('.login-btn');
    
    if (!username || !password) {
        showError('Please fill in all fields');
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> Logging in...';
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Login successful!', 'success');
            
            // Store session data for socket connection
            localStorage.setItem('sessionId', data.sessionId);
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('role', data.role);
            
            setTimeout(() => {
                window.location.href = data.redirect;
            }, 1000);
        } else {
            showError(data.error || 'Login failed');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="btn-text">Login</span><i class="fas fa-arrow-right"></i>';
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Network error. Please try again.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="btn-text">Login</span><i class="fas fa-arrow-right"></i>';
    }
});

// Check for existing session
window.addEventListener('load', () => {
    fetch('/api/session-check')
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                window.location.href = data.role === 'admin' ? '/admin' : '/dashboard';
            }
        })
        .catch(err => console.log('No existing session'));
});
