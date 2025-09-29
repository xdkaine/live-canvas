# Live Collaborative Canvas

A real-time collaborative drawing application built with Node.js, Express, Socket.IO, and HTML5 Canvas. Multiple users can draw simultaneously on the same canvas with real-time synchronization.

## Features

- **Real-time collaboration**: Multiple users can draw simultaneously
- **Server authority**: Server maintains authoritative canvas state to ensure consistency
- **User identification**: Each user gets a unique color and cursor
- **Live cursor tracking**: See other users' cursors moving in real-time
- **Drawing tools**: Color picker and brush size controls
- **Clear canvas**: Collaborative canvas clearing
- **Responsive design**: Works on desktop and mobile devices
- **Connection status**: Shows connection status and user count

## Architecture

### Server-Side Authority
- The server maintains the authoritative state of the canvas
- All drawing events are validated and synchronized through the server
- Canvas state is stored in memory (can be extended to use a database)
- New users receive the complete canvas state upon connection

### Real-time Synchronization
- Uses WebSocket connections via Socket.IO
- Drawing events are immediately broadcast to all connected clients
- Server ensures all clients receive the same drawing events in the same order

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Development Mode
```bash
npm run dev
```
This uses nodemon for automatic server restarts during development.

### Production Mode
```bash
npm start
```

The application will be available at `http://localhost:3000`

## How It Works

### Client-Server Communication

The application uses the following WebSocket events:

#### Client to Server:
- `draw-start`: Begin a new drawing stroke
- `draw-continue`: Add points to the current stroke
- `draw-end`: Finish the current stroke
- `cursor-move`: Update cursor position
- `clear-canvas`: Request to clear the canvas

#### Server to Client:
- `canvas-state`: Send complete canvas state (on connection)
- `user-info`: Send user's assigned color and ID
- `draw-start`: Broadcast new stroke start
- `draw-continue`: Broadcast stroke continuation
- `draw-end`: Broadcast stroke completion
- `cursor-move`: Broadcast cursor movements
- `user-joined`: Notify when a new user joins
- `user-left`: Notify when a user disconnects
- `clear-canvas`: Broadcast canvas clear event

### Drawing Process

1. User starts drawing (mousedown/touchstart)
2. Client sends `draw-start` event to server
3. Server creates a new stroke with unique ID and broadcasts to all clients
4. As user moves mouse/finger, client sends `draw-continue` events
5. Server adds points to the stroke and broadcasts updates
6. When user stops drawing, client sends `draw-end` event
7. Server finalizes the stroke

### Canvas Synchronization

- Server maintains complete canvas state with all strokes
- New users receive full canvas state upon connection
- All drawing events go through the server to ensure consistency
- Server is the single source of truth for canvas content

## File Structure

```
live-canvas/
├── server.js              # Main server file with WebSocket handling
├── package.json           # Project dependencies and scripts
├── public/
│   ├── index.html         # Main HTML page
│   └── canvas.js          # Client-side canvas and WebSocket logic
└── README.md              # This file
```

## Customization

### Adding New Features

To add new features, follow this pattern:

1. **Server-side**: Add event handlers in `server.js`
2. **Client-side**: Add corresponding events in `canvas.js`
3. **UI**: Update `index.html` for any new controls

### Scaling Considerations

For production use, consider:

- **Database storage**: Replace in-memory storage with a database
- **Redis adapter**: Use Redis for Socket.IO scaling across multiple servers
- **Authentication**: Add user authentication and session management
- **Rate limiting**: Implement rate limiting for drawing events
- **Canvas persistence**: Save canvas state to prevent data loss

## Browser Compatibility

- Modern browsers with HTML5 Canvas and WebSocket support
- Mobile browsers with touch event support
- Tested on Chrome, Firefox, Safari, and Edge

## Performance Notes

- Canvas redraws are optimized for smooth real-time updates
- Cursor position updates are throttled to 50ms intervals
- Drawing events are processed immediately for responsive feel
- Server broadcasts events to all clients including the sender for consistency

## Development

To contribute or modify:

1. Make changes to server.js for backend functionality
2. Update canvas.js for client-side drawing logic  
3. Modify index.html for UI changes
4. Test with multiple browser tabs/windows to simulate multiple users

## License

MIT License - feel free to use this project as a starting point for your own collaborative applications.