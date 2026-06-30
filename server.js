require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Models
const User = require('./models/User');
const Message = require('./models/Message');
const Settings = require('./models/Settings');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Dynamic Course Schema & Model (Declaring inline to prevent file structure errors on Railway)
const courseSchema = new mongoose.Schema({
  courseName: { type: String, required: true, unique: true },
  students: [
    {
      name: String,
      email: String,
      phone: String,
      addedAt: { type: Date, default: Date.now }
    }
  ]
});
const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Middlewares
const authenticateUser = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  next();
};

const authenticateAdmin = (req, res, next) => {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.redirect('/');
  }
  next();
};

// Socket.io Connection Logic (Maintained exactly as original code)
io.on('connection', async (socket) => {
  const userId = socket.handshake.query.userId;
  const sessionId = socket.handshake.query.sessionId;
  
  if (userId && sessionId) {
    try {
      const user = await User.findById(userId);
      if (user && user.sessionId === sessionId) {
        user.socketId = socket.id;
        await user.save();
        socket.userId = userId;
        socket.join(`user_${userId}`);
        socket.join('group_chat');
        if (user.role === 'admin') {
          const students = await User.find({ role: 'student' });
          students.forEach(student => socket.join(`private_${student._id}`));
        }
      } else {
        socket.emit('session_invalid', { message: 'Session expired. Please login again.' });
        socket.disconnect();
      }
    } catch (error) {
      socket.disconnect();
    }
  }
  
  socket.on('send_message', async (data) => {
    try {
      const { chatType, content, recipientId } = data;
      const sender = await User.findById(socket.userId);
      if (!sender) return;
      
      const message = new Message({ sender: socket.userId, recipient: chatType === 'private' ? recipientId : null, chatType, content });
      await message.save();
      await message.populate('sender', 'username role');
      
      if (chatType === 'group') io.to('group_chat').emit('new_message', message);
      else if (chatType === 'private') {
        io.to(`private_${socket.userId}`).emit('new_message', message);
        io.to(`private_${recipientId}`).emit('new_message', message);
      }
    } catch (err) { console.error(err); }
  });

  socket.on('disconnect', async () => {
    if (socket.userId) {
      const user = await User.findById(socket.userId);
      if (user && user.socketId === socket.id) { user.socketId = null; await user.save(); }
    }
  });
});

// --- ROUTES ---

app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin' : '/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login API
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.isBlocked) return res.status(403).json({ error: 'Account is blocked.' });
    
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    
    const newSessionId = uuidv4();
    if (user.sessionId && user.socketId) {
      io.to(user.socketId).emit('session_invalid', { message: 'Logged out from another device.' });
    }
    
    user.sessionId = newSessionId;
    user.lastLogin = new Date();
    await user.save();
    
    req.session.userId = user._id;
    req.session.role = user.role;
    req.session.sessionId = newSessionId;

    // Seeding default core courses if they do not exist
    const defaults = ['Mentalism', 'Indian Dropshipping', 'International Dropshipping'];
    for (let name of defaults) {
      const exist = await Course.findOne({ courseName: name });
      if (!exist) await Course.create({ courseName: name, students: [] });
    }
    
    res.json({ success: true, redirect: user.role === 'admin' ? '/admin' : '/dashboard', sessionId: newSessionId, userId: user._id, role: user.role });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/dashboard', authenticateUser, (req, res) => {
  if (req.session.role !== 'student') return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- PREMIUM BLACK & OFF-WHITE ADMIN DASHBOARD ---
app.get('/admin', authenticateAdmin, async (req, res) => {
  try {
    const courses = await Course.find({});
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>MOCO Admin Panel</title>
        <style>
          body { background-color: #0b0b0b; color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 30px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; padding-bottom: 20px; margin-bottom: 30px; }
          h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }
          .logout-btn { color: #888; text-decoration: none; font-size: 14px; transition: 0.2s; }
          .logout-btn:hover { color: #fff; }
          .add-section-btn { background: #f5f5f7; color: #000; border: none; padding: 12px 24px; font-weight: 600; border-radius: 6px; cursor: pointer; transition: 0.2s; }
          .add-section-btn:hover { background: #fff; }
          .tabs { display: flex; gap: 8px; border-bottom: 1px solid #222; padding-bottom: 12px; margin-bottom: 25px; overflow-x: auto; }
          .tab-btn { background: none; border: none; color: #888; padding: 10px 20px; cursor: pointer; font-size: 15px; font-weight: 500; transition: 0.2s; border-radius: 6px; }
          .tab-btn.active { background: #16161a; color: #fff; border: 1px solid #333; }
          .course-section { display: none; background: #16161a; border: 1px solid #222; padding: 25px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
          .course-section.active { display: block; }
          .add-student-btn { background: #222; color: #fff; border: 1px solid #444; padding: 10px 18px; font-weight: 500; border-radius: 6px; cursor: pointer; margin-bottom: 20px; transition: 0.2s; }
          .add-student-btn:hover { background: #333; border-color: #666; }
          table { width: 100%; border-collapse: collapse; text-align: left; }
          th, td { padding: 14px; border-bottom: 1px solid #222; font-size: 14px; }
          th { color: #888; font-weight: 500; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
          td { color: #e1e1e6; }
          tr:hover td { background: #1f1f24; color: #fff; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>MOCO ACADEMY — Admin</h1>
          <button class="add-section-btn" onclick="addNewSection()">+ Add New Section</button>
        </div>

        <div class="tabs">
          ${courses.map((c, i) => `
            <button class="tab-btn ${i === 0 ? 'active' : ''}" onclick="openTab(event, 'course-${c._id}')">${c.courseName}</button>
          `).join('')}
        </div>

        ${courses.map((c, i) => `
          <div id="course-${c._id}" class="course-section ${i === 0 ? 'active' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
              <h2 style="margin:0; font-size:20px; font-weight:500;">${c.courseName} Students</h2>
              <button class="add-student-btn" onclick="addStudent('${c._id}')">+ Add Student</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Joined Date</th>
                </tr>
              </thead>
              <tbody>
                ${c.students.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#555; padding: 30px 0;">No students added yet.</td></tr>' : 
                  c.students.map(s => `
                    <tr>
                      <td><b>${s.name}</b></td>
                      <td>${s.email || '-'}</td>
                      <td>${s.phone || '-'}</td>
                      <td>${new Date(s.addedAt).toLocaleDateString()}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}

        <script>
          function openTab(evt, id) {
            let s = document.getElementsByClassName("course-section");
            for (let i = 0; i < s.length; i++) s[i].classList.remove("active");
            let t = document.getElementsByClassName("tab-btn");
            for (let i = 0; i < t.length; i++) t[i].classList.remove("active");
            document.getElementById(id).classList.add("active");
            evt.currentTarget.classList.add("active");
          }

          function addNewSection() {
            const name = prompt("Enter New Course Section Name:");
            if (!name || name.trim() === "") return;
            fetch('/api/admin/custom-sections', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ courseName: name.trim() })
            }).then(r => r.json()).then(d => { if(d.success) window.location.reload(); else alert(d.error); });
          }

          function addStudent(courseId) {
            const name = prompt("Enter Student Name:");
            if (!name) return;
            const email = prompt("Enter Email:");
            const phone = prompt("Enter Phone:");
            fetch('/api/admin/custom-students', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ courseId, name, email, phone })
            }).then(r => r.json()).then(d => { if(d.success) window.location.reload(); });
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) { res.status(500).send("Error loading admin dashboard"); }
});

// Custom APIs for Course & Student Management
app.post('/api/admin/custom-sections', authenticateAdmin, async (req, res) => {
  try {
    const { courseName } = req.body;
    const exists = await Course.findOne({ courseName });
    if (exists) return res.json({ success: false, error: "Section already exists" });
    await Course.create({ courseName, students: [] });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/admin/custom-students', authenticateAdmin, async (req, res) => {
  try {
    const { courseId, name, email, phone } = req.body;
    await Course.findByIdAndUpdate(courseId, { $push: { students: { name, email, phone } } });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// Legacy Admin Endpoints
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try { const users = await User.find({ role: 'student' }).select('-password -sessionId -socketId'); res.json(users); } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// Initialize Admin with ENV credentials
const initializeAdmin = async () => {
  try {
    const envUsername = process.env.ADMIN_USERNAME || 'admin_meesho';
    const envPassword = process.env.ADMIN_PASSWORD || 'admin123';
    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      await User.create({ username: envUsername, password: envPassword, role: 'admin' });
    } else {
      if (admin.username !== envUsername) { admin.username = envUsername; await admin.save(); }
      const isMatch = await admin.comparePassword(envPassword);
      if (!isMatch) { admin.password = envPassword; await admin.save(); }
    }
  } catch (err) { console.error(err); }
};
initializeAdmin();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));