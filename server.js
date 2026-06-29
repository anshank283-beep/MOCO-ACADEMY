require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const User = require('./models/User');
const Message = require('./models/Message');
const Settings = require('./models/Settings');
const Course = require('./models/Course');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

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

// Middleware to check authentication
const authenticateUser = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  next();
};

// Middleware to check if user is admin
const authenticateAdmin = (req, res, next) => {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.redirect('/');
  }
  next();
};

// Socket.io Connection with Single Device Lock
io.on('connection', async (socket) => {
  console.log('New socket connection:', socket.id);
  
  const userId = socket.handshake.query.userId;
  const sessionId = socket.handshake.query.sessionId;
  
  if (userId && sessionId) {
    try {
      const user = await User.findById(userId);
      
      // Validate session - single device lock
      if (user && user.sessionId === sessionId) {
        user.socketId = socket.id;
        await user.save();
        
        socket.userId = userId;
        socket.join(`user_${userId}`);
        
        // Join appropriate chat rooms
        if (user.role === 'student') {
          socket.join('group_chat');
          socket.join(`private_${userId}`);
        } else if (user.role === 'admin') {
          socket.join('group_chat');
          // Admin joins all private chats
          const students = await User.find({ role: 'student' });
          students.forEach(student => {
            socket.join(`private_${student._id}`);
          });
        }
        
        console.log(`User ${user.username} connected with session ${sessionId}`);
      } else {
        // Invalid session - force logout
        socket.emit('session_invalid', { message: 'Session expired. Please login again.' });
        socket.disconnect();
      }
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.disconnect();
    }
  }
  
  // Handle new messages
  socket.on('send_message', async (data) => {
    try {
      const { chatType, content, recipientId } = data;
      const sender = await User.findById(socket.userId);
      
      if (!sender) return;
      
      // Students can only send private messages to admin
      if (chatType === 'private' && sender.role === 'student') {
        const admin = await User.findOne({ role: 'admin' });
        if (!admin || recipientId !== admin._id.toString()) {
          return;
        }
      }
      
      const message = new Message({
        sender: socket.userId,
        recipient: chatType === 'private' ? recipientId : null,
        chatType,
        content
      });
      
      await message.save();
      
      // Populate sender details
      await message.populate('sender', 'username role');
      
      if (chatType === 'group') {
        io.to('group_chat').emit('new_message', message);
      } else if (chatType === 'private') {
        io.to(`private_${socket.userId}`).emit('new_message', message);
        io.to(`private_${recipientId}`).emit('new_message', message);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });
  
  // Handle typing indicators
  socket.on('typing', (data) => {
    const { chatType, recipientId } = data;
    if (chatType === 'group') {
      socket.to('group_chat').emit('user_typing', { userId: socket.userId });
    } else if (chatType === 'private') {
      socket.to(`private_${recipientId}`).emit('user_typing', { userId: socket.userId });
    }
  });
  
  socket.on('disconnect', async () => {
    if (socket.userId) {
      try {
        const user = await User.findById(socket.userId);
        if (user && user.socketId === socket.id) {
          user.socketId = null;
          await user.save();
        }
      } catch (error) {
        console.error('Error updating socket on disconnect:', error);
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

// Routes
app.get('/', (req, res) => {
  if (req.session.userId) {
    if (req.session.role === 'admin') {
      return res.redirect('/admin');
    } else {
      return res.redirect('/dashboard');
    }
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.isBlocked) {
      return res.status(403).json({ error: 'Account is blocked. Contact admin.' });
    }
    
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate new session ID for single device lock
    const newSessionId = uuidv4();
    
    // If user has existing session, invalidate it
    if (user.sessionId && user.socketId) {
      io.to(user.socketId).emit('session_invalid', { 
        message: 'You have been logged out from another device.' 
      });
    }
    
    user.sessionId = newSessionId;
    user.lastLogin = new Date();
    await user.save();
    
    req.session.userId = user._id;
    req.session.role = user.role;
    req.session.sessionId = newSessionId;
    
    res.json({ 
      success: true, 
      redirect: user.role === 'admin' ? '/admin' : '/dashboard',
      sessionId: newSessionId,
      userId: user._id,
      role: user.role
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

app.get('/dashboard', authenticateUser, (req, res) => {
  if (req.session.role !== 'student') {
    return res.redirect('/admin');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', authenticateAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API Routes for Admin
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: 'student' }).select('-password -sessionId -socketId');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching users' });
  }
});

app.post('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    const user = new User({
      username,
      password,
      role: 'student'
    });
    
    await user.save();
    res.json({ success: true, user: { username: user.username, _id: user._id } });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Error creating user' });
  }
});

app.delete('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting user' });
  }
});

app.patch('/api/admin/users/:userId/block', authenticateAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.isBlocked = !user.isBlocked;
    await user.save();
    
    // If blocking, invalidate their session
    if (user.isBlocked && user.socketId) {
      io.to(user.socketId).emit('session_invalid', { 
        message: 'Your account has been blocked. Contact admin.' 
      });
    }
    
    res.json({ success: true, isBlocked: user.isBlocked });
  } catch (error) {
    res.status(500).json({ error: 'Error updating user' });
  }
});

// API Routes for Chat
app.get('/api/messages/group', authenticateUser, async (req, res) => {
  try {
    const messages = await Message.find({ chatType: 'group' })
      .populate('sender', 'username role')
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

app.get('/api/messages/private/:userId', authenticateUser, async (req, res) => {
  try {
    const currentUserId = req.session.userId;
    const targetUserId = req.params.userId;
    
    // Students can only view their own private chat with admin
    if (req.session.role === 'student' && targetUserId !== currentUserId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const admin = await User.findOne({ role: 'admin' });
    const messages = await Message.find({
      chatType: 'private',
      $or: [
        { sender: currentUserId, recipient: targetUserId },
        { sender: targetUserId, recipient: currentUserId }
      ]
    })
    .populate('sender', 'username role')
    .sort({ timestamp: -1 })
    .limit(50);
    
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

// API Routes for Settings
app.get('/api/settings', authenticateUser, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
      await settings.save();
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching settings' });
  }
});

app.patch('/api/settings', authenticateAdmin, async (req, res) => {
  try {
    const { googleMeetLink, nextSessionDate, sessionTitle } = req.body;
    
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }
    
    if (googleMeetLink !== undefined) settings.googleMeetLink = googleMeetLink;
    if (nextSessionDate !== undefined) settings.nextSessionDate = new Date(nextSessionDate);
    if (sessionTitle !== undefined) settings.sessionTitle = sessionTitle;
    
    settings.updatedAt = new Date();
    await settings.save();
    
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Error updating settings' });
  }
});

// API Routes for Courses
app.get('/api/courses', authenticateUser, async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching courses' });
  }
});

app.get('/api/admin/courses', authenticateAdmin, async (req, res) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching courses' });
  }
});

app.post('/api/admin/courses', authenticateAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      pricing,
      categories,
      videoUrl,
      documentUrl,
      instructor,
      duration,
      level
    } = req.body;
    
    const course = new Course({
      title,
      description,
      pricing,
      categories: categories ? categories.split(',').map(c => c.trim()) : [],
      videoUrl,
      documentUrl,
      instructor,
      duration,
      level
    });
    
    await course.save();
    res.json({ success: true, course });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ error: 'Error creating course' });
  }
});

app.patch('/api/admin/courses/:courseId', authenticateAdmin, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const {
      title,
      description,
      pricing,
      categories,
      videoUrl,
      documentUrl,
      instructor,
      duration,
      level,
      isActive
    } = req.body;
    
    if (title !== undefined) course.title = title;
    if (description !== undefined) course.description = description;
    if (pricing !== undefined) course.pricing = pricing;
    if (categories !== undefined) course.categories = categories.split(',').map(c => c.trim());
    if (videoUrl !== undefined) course.videoUrl = videoUrl;
    if (documentUrl !== undefined) course.documentUrl = documentUrl;
    if (instructor !== undefined) course.instructor = instructor;
    if (duration !== undefined) course.duration = duration;
    if (level !== undefined) course.level = level;
    if (isActive !== undefined) course.isActive = isActive;
    
    await course.save();
    res.json({ success: true, course });
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ error: 'Error updating course' });
  }
});

app.delete('/api/admin/courses/:courseId', authenticateAdmin, async (req, res) => {
  try {
    await Course.findByIdAndDelete(req.params.courseId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting course' });
  }
});

// Initialize admin user if not exists
const initializeAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const admin = new User({
        username: process.env.ADMIN_USERNAME || 'admin_meesho',
        password: process.env.ADMIN_PASSWORD || 'admin123',
        role: 'admin'
      });
      await admin.save();
      console.log('Admin user created successfully');
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
};

initializeAdmin();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
