# Meesho Dropshipping Course - Web Application

A production-ready, mobile-first web application for managing a dropshipping course with real-time chat, live sessions, and user management.

## Features

- **Single Visual Login Page**: Aesthetic mobile-first design for all users
- **Role-Based Access**: Separate dashboards for Admin and Students
- **Single Device Login Lock**: Security feature restricting one active session per user
- **Real-Time Chat**: Persistent group and private chat using Socket.io and MongoDB
- **Live Session Management**: Google Meet integration for Sunday classes
- **User Management**: Admin can create, block, and delete student accounts
- **Mobile-First Design**: Optimized for mobile devices with icon-based navigation

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB Atlas
- **Real-Time Communication**: Socket.io
- **Authentication**: Express Sessions with MongoDB store
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Deployment**: Render.com

## Project Structure

```
meesho-dropshipping-course/
├── models/
│   ├── User.js           # User schema with session management
│   ├── Message.js        # Message schema for chat persistence
│   └── Settings.js       # Application settings schema
├── public/
│   ├── css/
│   │   └── styles.css    # Mobile-first responsive styles
│   ├── js/
│   │   ├── login.js      # Login page logic
│   │   ├── dashboard.js  # Student dashboard logic
│   │   └── admin.js      # Admin dashboard logic
│   ├── login.html        # Login page
│   ├── dashboard.html    # Student dashboard
│   └── admin.html        # Admin dashboard
├── .env.example          # Environment variables template
├── package.json          # Dependencies and scripts
├── server.js             # Main Express server with Socket.io
└── README.md             # This file
```

## Prerequisites

- Node.js (v14 or higher)
- MongoDB Atlas account
- Render.com account (for deployment)
- Git

## Local Development Setup

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd meesho-dropshipping-course
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account and cluster
3. Create a database named `meesho-course`
4. Get your connection string from the Atlas dashboard
5. Whitelist IP addresses (use `0.0.0.0/0` for development)

### 4. Configure Environment Variables

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` with your credentials:
```env
MONGODB_URI=mongodb+srv://your_username:your_password@cluster.mongodb.net/meesho-course?retryWrites=true&w=majority
SESSION_SECRET=your_super_secret_session_key_change_this_in_production
PORT=3000
ADMIN_USERNAME=admin_meesho
ADMIN_PASSWORD=your_secure_admin_password
```

### 5. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Deployment on Render.com

### Step 1: Prepare Your Code

1. Ensure your code is pushed to a Git repository (GitHub, GitLab, or Bitbucket)
2. Make sure `.env` is in `.gitignore` (it should not be committed)

### Step 2: Set Up MongoDB Atlas for Production

1. In MongoDB Atlas, go to Network Access
2. Add the following Render IP ranges to your IP whitelist:
   - For Render's free tier, you may need to use `0.0.0.0/0` (allows all IPs)
   - For better security, use Render's specific IP ranges

### Step 3: Deploy Backend on Render

1. Log in to [Render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect your Git repository
4. Configure the service:
   - **Name**: meesho-course-backend
   - **Region**: Choose the region closest to your users
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Add Environment Variables:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `SESSION_SECRET`: Generate a strong random string
   - `PORT`: 10000 (or leave empty for Render's default)
   - `ADMIN_USERNAME`: Your admin username
   - `ADMIN_PASSWORD`: Your admin password
6. Click "Create Web Service"

### Step 4: Configure Domain (Optional)

1. In your Render service dashboard, go to "Settings"
2. Scroll to "Custom Domains"
3. Add your custom domain (e.g., `course.yourdomain.com`)
4. Update your DNS records as instructed by Render

### Step 5: Verify Deployment

1. Wait for the deployment to complete (usually 2-5 minutes)
2. Access your application at the URL provided by Render
3. Test the login functionality with your admin credentials

## Default Credentials

After first deployment, the default admin credentials are:

- **Username**: `admin_meesho` (or whatever you set in `ADMIN_USERNAME`)
- **Password**: `your_secure_admin_password` (or whatever you set in `ADMIN_PASSWORD`)

**Important**: Change these immediately after first login by updating the environment variables in Render.

## Usage Guide

### For Admin

1. **Login**: Use admin credentials at the login page
2. **Create Students**: Go to Users tab → Enter username and password → Click "Create Student"
3. **Manage Sessions**: Go to Settings tab → Update Google Meet link and session date
4. **View Chats**: 
   - Group Chat: View and participate in the general group chat
   - Private Chats: Select a student to view their private conversation
5. **Block/Unblock Users**: Use the block button in the Users table

### For Students

1. **Login**: Use credentials provided by admin
2. **Live Sessions**: View upcoming Sunday sessions and join Google Meet
3. **Group Chat**: Participate in community discussions
4. **Private Chat**: Message the admin for personal support

## Security Features

### Single Device Login Lock

- Each user can only be logged in from one device at a time
- When a user logs in from a new device, the old session is automatically invalidated
- The old device receives a WebSocket event forcing logout
- Session IDs are stored in MongoDB for validation

### Session Management

- Sessions are stored in MongoDB using connect-mongo
- Sessions expire after 30 days of inactivity
- Secure session cookies in production mode

### Password Security

- Passwords are hashed using bcryptjs before storage
- Minimum 10-character salt rounds for hashing
- Passwords are never stored in plain text

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout

### Admin Routes (Admin Only)
- `GET /api/admin/users` - Get all students
- `POST /api/admin/users` - Create new student
- `DELETE /api/admin/users/:userId` - Delete student
- `PATCH /api/admin/users/:userId/block` - Block/unblock student

### Chat Routes
- `GET /api/messages/group` - Get group chat messages
- `GET /api/messages/private/:userId` - Get private chat messages

### Settings Routes
- `GET /api/settings` - Get application settings
- `PATCH /api/settings` (Admin only) - Update settings

## WebSocket Events

### Client → Server
- `send_message` - Send a new message
- `typing` - Emit typing indicator

### Server → Client
- `new_message` - Receive new message
- `session_invalid` - Session invalidated (force logout)
- `user_typing` - User is typing indicator

## Troubleshooting

### Database Connection Issues
- Verify your MongoDB Atlas connection string
- Check IP whitelist in MongoDB Atlas
- Ensure database name matches in connection string

### Socket.io Connection Issues
- Check that the server is running
- Verify WebSocket support in your network
- Check browser console for errors

### Session Issues
- Clear browser cookies and localStorage
- Verify SESSION_SECRET is set correctly
- Check MongoDB session store is accessible

### Deployment Issues
- Check Render logs for error messages
- Verify all environment variables are set
- Ensure MongoDB Atlas allows connections from Render IPs

## Performance Optimization

- MongoDB indexes on message queries for faster retrieval
- Limited message history (last 50 messages) to reduce load
- Efficient WebSocket room management
- CSS animations for smooth UI transitions

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

ISC

## Support

For issues or questions, please contact the development team.

## Future Enhancements

- Push notifications for new messages
- File sharing in chat
- Video recording of live sessions
- Progress tracking for students
- Quiz and assessment features
- Certificate generation upon course completion
