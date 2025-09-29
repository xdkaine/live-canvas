const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();

// middleware fix for cloudflare websockets
app.use((req, res, next) => {
  if (req.headers['cf-connecting-ip']) {
    req.ip = req.headers['cf-connecting-ip'];
  }
  
  if (req.headers['cf-ray']) {
    res.setHeader('X-Cloudflare-Ray', req.headers['cf-ray']);
  }
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin');
  
  next();
});

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.TUNNEL_DOMAIN ? [process.env.TUNNEL_DOMAIN, `https://${process.env.TUNNEL_DOMAIN}`, "http://localhost:3003"] : "*",
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Origin"]
  },
  transports: ['polling', 'websocket'], 
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  allowUpgrades: true,
  cookie: false, 
  serveClient: true,
  path: '/socket.io/'
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for canvas state (in production, use a database)
let canvasState = {
  strokes: [], // Array of drawing strokes
  users: new Map() // Connected users
};

// Store active connections
const connectedClients = new Map();

io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);
  console.log('📡 Transport:', socket.conn.transport.name);
  console.log('🌐 Headers:', {
    origin: socket.handshake.headers.origin,
    'user-agent': socket.handshake.headers['user-agent']?.substring(0, 50) + '...',
    'cf-ray': socket.handshake.headers['cf-ray'] || 'Not from Cloudflare'
  });
  
  // Generate unique user ID and color
  const userId = uuidv4();
  const userColor = generateUserColor();
  
  // Store user information
  const userInfo = {
    id: userId,
    socketId: socket.id,
    color: userColor,
    cursor: { x: 0, y: 0 }
  };
  
  canvasState.users.set(userId, userInfo);
  connectedClients.set(socket.id, userId);
  
  // Send current canvas state to new user
  socket.emit('canvas-state', {
    strokes: canvasState.strokes,
    users: Array.from(canvasState.users.values())
  });
  
  // Send user their assigned color
  socket.emit('user-info', userInfo);
  
  // Broadcast new user to all other clients
  socket.broadcast.emit('user-joined', userInfo);
  
  // Handle drawing events
  socket.on('draw-start', (data) => {
    const stroke = {
      id: uuidv4(),
      userId: connectedClients.get(socket.id),
      color: data.color || userColor,
      width: data.width || 2,
      points: [{ x: data.x, y: data.y }],
      timestamp: Date.now()
    };
    
    canvasState.strokes.push(stroke);
    
    // Broadcast to all clients including sender
    io.emit('draw-start', stroke);
  });
  
  socket.on('draw-continue', (data) => {
    const userId = connectedClients.get(socket.id);
    const currentStroke = canvasState.strokes.find(stroke => 
      stroke.userId === userId && stroke.id === data.strokeId
    );
    
    if (currentStroke) {
      currentStroke.points.push({ x: data.x, y: data.y });
      
      // Broadcast to all clients including sender
      io.emit('draw-continue', {
        strokeId: data.strokeId,
        x: data.x,
        y: data.y
      });
    }
  });
  
  socket.on('draw-end', (data) => {
    // Broadcast to all clients
    io.emit('draw-end', { strokeId: data.strokeId });
  });
  
  // Handle cursor movement
  socket.on('cursor-move', (data) => {
    const userId = connectedClients.get(socket.id);
    const user = canvasState.users.get(userId);
    
    if (user) {
      user.cursor = { x: data.x, y: data.y };
      
      // Broadcast cursor position to all other clients
      socket.broadcast.emit('cursor-move', {
        userId: userId,
        x: data.x,
        y: data.y,
        color: user.color
      });
    }
  });
  
  // Handle clear canvas
  socket.on('clear-canvas', () => {
    canvasState.strokes = [];
    io.emit('clear-canvas');
  });
  
  // Handle chat messages
  socket.on('chat-message', (data) => {
    const userId = connectedClients.get(socket.id);
    const user = canvasState.users.get(userId);
    
    if (user && data.message && data.message.trim()) {
      const chatMessage = {
        id: uuidv4(),
        userId: userId,
        userColor: user.color,
        message: data.message.trim(),
        timestamp: data.timestamp || Date.now()
      };
      
      // Broadcast chat message to all clients
      io.emit('chat-message', chatMessage);
      
      console.log(`Chat message from ${userId}: ${data.message}`);
    }
  });
  
  // Handle typing indicators (optional)
  socket.on('user-typing', (data) => {
    const userId = connectedClients.get(socket.id);
    if (userId) {
      socket.broadcast.emit('user-typing', {
        userId: userId,
        typing: data.typing
      });
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const userId = connectedClients.get(socket.id);
    if (userId) {
      canvasState.users.delete(userId);
      connectedClients.delete(socket.id);
      
      // Broadcast user left to all clients
      io.emit('user-left', { userId });
    }
  });
});

// Generate a random color for each user
function generateUserColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});