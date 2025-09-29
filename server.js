const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const url = require('url');

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

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  path: '/ws',
  // Cloudflare-friendly options
  verifyClient: (info) => {
    // Accept connections from any origin for now
    return true;
  }
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

// Utility function to send message to all clients
function broadcast(message, excludeWs = null) {
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Utility function to send message to specific client
function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

wss.on('connection', (ws, req) => {
  const connectionId = uuidv4();
  console.log('User connected:', connectionId);
  
  // Generate unique user ID and color
  const userId = uuidv4();
  const userColor = generateUserColor();
  
  // Store user information
  const userInfo = {
    id: userId,
    socketId: connectionId,
    color: userColor,
    cursor: { x: 0, y: 0 }
  };
  
  canvasState.users.set(userId, userInfo);
  connectedClients.set(ws, userId);
  
  // Send current canvas state to new user
  sendToClient(ws, {
    type: 'canvas-state',
    data: {
      strokes: canvasState.strokes,
      users: Array.from(canvasState.users.values())
    }
  });
  
  // Send user their assigned color
  sendToClient(ws, {
    type: 'user-info',
    data: userInfo
  });
  
  // Broadcast new user to all other clients
  broadcast({
    type: 'user-joined',
    data: userInfo
  }, ws);
  
  // Handle WebSocket messages
  ws.on('message', (message) => {
    try {
      const { type, data } = JSON.parse(message);
      const userId = connectedClients.get(ws);
      
      switch (type) {
        case 'draw-start':
          const stroke = {
            id: uuidv4(),
            userId: userId,
            color: data.color || userColor,
            width: data.width || 2,
            points: [{ x: data.x, y: data.y }],
            timestamp: Date.now()
          };
          
          canvasState.strokes.push(stroke);
          
          // Broadcast to all clients including sender
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'draw-start',
                data: stroke
              }));
            }
          });
          break;
          
        case 'draw-continue':
          const currentStroke = canvasState.strokes.find(stroke => 
            stroke.userId === userId && stroke.id === data.strokeId
          );
          
          if (currentStroke) {
            currentStroke.points.push({ x: data.x, y: data.y });
            
            // Broadcast to all clients including sender
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'draw-continue',
                  data: {
                    strokeId: data.strokeId,
                    x: data.x,
                    y: data.y
                  }
                }));
              }
            });
          }
          break;
          
        case 'draw-end':
          // Broadcast to all clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'draw-end',
                data: { strokeId: data.strokeId }
              }));
            }
          });
          break;
          
        case 'cursor-move':
          const cursorUser = canvasState.users.get(userId);
          
          if (cursorUser) {
            cursorUser.cursor = { x: data.x, y: data.y };
            
            // Broadcast cursor position to all other clients
            broadcast({
              type: 'cursor-move',
              data: {
                userId: userId,
                x: data.x,
                y: data.y,
                color: cursorUser.color
              }
            }, ws);
          }
          break;
          
        case 'clear-canvas':
          canvasState.strokes = [];
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'clear-canvas',
                data: {}
              }));
            }
          });
          break;
  
        case 'chat-message':
          const chatUser = canvasState.users.get(userId);
          
          if (chatUser && data.message && data.message.trim()) {
            const chatMessage = {
              id: uuidv4(),
              userId: userId,
              userColor: chatUser.color,
              message: data.message.trim(),
              timestamp: data.timestamp || Date.now()
            };
            
            // Broadcast chat message to all clients
            broadcast({
              type: 'chat-message',
              data: chatMessage
            });
            
            console.log(`Chat message from ${userId}: ${data.message}`);
          }
          break;
          
        case 'user-typing':
          if (userId) {
            broadcast({
              type: 'user-typing',
              data: {
                userId: userId,
                typing: data.typing
              }
            }, ws);
          }
          break;
          
        default:
          console.log('Unknown message type:', type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });
  
  // Handle WebSocket close
  ws.on('close', () => {
    console.log('User disconnected:', connectionId);
    
    const userId = connectedClients.get(ws);
    if (userId) {
      canvasState.users.delete(userId);
      connectedClients.delete(ws);
      
      // Broadcast user left to all clients
      broadcast({
        type: 'user-left',
        data: { userId }
      });
    }
  });
  
  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
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