class CollaborativeCanvas {
    constructor() {
        this.socket = io();
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.currentStroke = null;
        this.userColor = '#000000';
        this.userInfo = null;
        this.connectedUsers = new Map();
        this.userCursors = new Map();
        this.activeStrokes = new Map();
        
        // Zoom and pan properties
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.lastPanPoint = { x: 0, y: 0 };
        
        // Chat properties
        this.chatOpen = false;
        this.userName = null;
        
        // Local canvas state for redrawing
        this.canvasStrokes = [];
        
        this.setupCanvas();
        this.setupEventListeners();
        this.setupSocketEvents();
        this.setupUI();
    }
    
    setupCanvas() {
        // Set canvas size to window size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Set canvas properties
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Initialize transform
        this.ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
    }
    
    resizeCanvas() {
        const container = document.getElementById('canvas-container');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // Reset canvas properties after resize
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Redraw canvas after resize
        this.redrawCanvas();
    }
    
    setupEventListeners() {
        // Mouse events for drawing
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseout', () => this.handleMouseUp());
        
        // Zoom with mouse wheel
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMouseDown(mouseEvent);
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMouseMove(mouseEvent);
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleMouseUp();
        });
    }
    
    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
            document.getElementById('loading').style.display = 'none';
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('user-info', (userInfo) => {
            this.userInfo = userInfo;
            this.userColor = userInfo.color;
            document.getElementById('colorPicker').value = this.userColor;
        });
        
        this.socket.on('canvas-state', (state) => {
            // Store canvas strokes locally
            this.canvasStrokes = [...state.strokes];
            
            // Update users list
            this.connectedUsers.clear();
            state.users.forEach(user => {
                this.connectedUsers.set(user.id, user);
            });
            this.updateUserCount();
            
            // Redraw canvas with current transform
            this.redrawCanvas();
        });
        
        this.socket.on('draw-start', (stroke) => {
            // Add stroke to local storage
            this.canvasStrokes.push(stroke);
            this.drawStrokeStart(stroke);
        });
        
        this.socket.on('draw-continue', (data) => {
            // Update the stroke in local storage
            const stroke = this.canvasStrokes.find(s => s.id === data.strokeId);
            if (stroke) {
                stroke.points.push({ x: data.x, y: data.y });
            }
            this.drawStrokeContinue(data);
        });
        
        this.socket.on('draw-end', (data) => {
            // Clean up the active stroke
            if (this.activeStrokes && this.activeStrokes.has(data.strokeId)) {
                this.activeStrokes.delete(data.strokeId);
            }
        });
        
        this.socket.on('cursor-move', (data) => {
            this.updateRemoteCursor(data);
        });
        
        this.socket.on('user-joined', (userInfo) => {
            this.connectedUsers.set(userInfo.id, userInfo);
            this.updateUserCount();
        });
        
        this.socket.on('user-left', (data) => {
            this.connectedUsers.delete(data.userId);
            this.removeUserCursor(data.userId);
            this.updateUserCount();
        });
        
        this.socket.on('clear-canvas', () => {
            this.canvasStrokes = [];
            this.clearCanvas(false);
        });
        
        this.socket.on('chat-message', (data) => {
            this.displayChatMessage(data);
        });
        
        this.socket.on('user-typing', (data) => {
            this.showTypingIndicator(data);
        });
    }
    
    setupUI() {
        // Color picker and palette
        const colorPicker = document.getElementById('colorPicker');
        const colorSwatches = document.querySelectorAll('.color-swatch');
        
        colorPicker.addEventListener('change', (e) => {
            this.userColor = e.target.value;
            this.updateActiveColorSwatch();
        });
        
        colorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.dataset.color;
                this.userColor = color;
                colorPicker.value = color;
                this.updateActiveColorSwatch();
            });
        });
        
        // Brush size
        const brushSize = document.getElementById('brushSize');
        const brushSizeValue = document.getElementById('brushSizeValue');
        
        brushSize.addEventListener('input', (e) => {
            brushSizeValue.textContent = e.target.value;
        });
        
        // Zoom controls
        const zoomIn = document.getElementById('zoomIn');
        const zoomOut = document.getElementById('zoomOut');
        const zoomReset = document.getElementById('zoomReset');
        
        zoomIn.addEventListener('click', () => this.setZoom(this.zoom * 1.2));
        zoomOut.addEventListener('click', () => this.setZoom(this.zoom / 1.2));
        zoomReset.addEventListener('click', () => this.resetZoom());
        
        // Clear canvas
        const clearButton = document.getElementById('clearCanvas');
        clearButton.addEventListener('click', () => {
            this.socket.emit('clear-canvas');
        });
        
        // Chat controls
        const toggleChat = document.getElementById('toggleChat');
        const closeChatBtn = document.getElementById('closeChatBtn');
        const chatInput = document.getElementById('chatInput');
        const sendChatBtn = document.getElementById('sendChatBtn');
        
        toggleChat.addEventListener('click', () => this.toggleChat());
        closeChatBtn.addEventListener('click', () => this.toggleChat());
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendChatMessage();
            }
        });
        
        sendChatBtn.addEventListener('click', () => this.sendChatMessage());

        const themeToggle = document.getElementById('themeToggle');
        themeToggle.addEventListener('click', () => this.toggleTheme());
        this.initializeTheme();
        
        // Initialize UI
        this.updateActiveColorSwatch();
        this.updateZoomDisplay();
    }
    
    updateActiveColorSwatch() {
        const colorSwatches = document.querySelectorAll('.color-swatch');
        colorSwatches.forEach(swatch => {
            if (swatch.dataset.color.toLowerCase() === this.userColor.toLowerCase()) {
                swatch.classList.add('active');
            } else {
                swatch.classList.remove('active');
            }
        });
    }
    
    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const rawX = e.clientX - rect.left;
        const rawY = e.clientY - rect.top;
        
        // Convert screen coordinates to canvas coordinates considering zoom and pan
        return {
            x: (rawX - this.panX) / this.zoom,
            y: (rawY - this.panY) / this.zoom
        };
    }
    
    handleMouseDown(e) {
        const coords = this.getCanvasCoordinates(e);
        
        if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
            // Middle mouse button or Ctrl+click for panning
            this.isPanning = true;
            this.lastPanPoint = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grab';
            e.preventDefault();
        } else if (e.button === 0) {
            // Left mouse button for drawing
            this.startDrawing(e);
        }
    }
    
    handleMouseMove(e) {
        if (this.isPanning) {
            const deltaX = e.clientX - this.lastPanPoint.x;
            const deltaY = e.clientY - this.lastPanPoint.y;
            
            this.panX += deltaX;
            this.panY += deltaY;
            
            this.lastPanPoint = { x: e.clientX, y: e.clientY };
            this.updateCanvasTransform();
            this.canvas.style.cursor = 'grabbing';
        } else {
            this.continueDrawing(e);
            this.updateCursor(e);
        }
    }
    
    handleMouseUp() {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = 'crosshair';
        } else {
            this.stopDrawing();
        }
    }
    
    handleWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.max(0.1, Math.min(5, this.zoom * zoomFactor));
        
        if (newZoom !== this.zoom) {
            // Zoom towards mouse cursor
            this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
            this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
            this.zoom = newZoom;
            
            this.updateCanvasTransform();
            this.updateZoomDisplay();
        }
    }
    
    updateCanvasTransform() {
        this.redrawCanvas();
    }
    
    setZoom(newZoom) {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.panX = centerX - (centerX - this.panX) * (newZoom / this.zoom);
        this.panY = centerY - (centerY - this.panY) * (newZoom / this.zoom);
        this.zoom = Math.max(0.1, Math.min(5, newZoom));
        
        this.updateCanvasTransform();
        this.updateZoomDisplay();
    }
    
    resetZoom() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.updateCanvasTransform();
        this.updateZoomDisplay();
    }
    
    updateZoomDisplay() {
        const zoomLevel = document.getElementById('zoomLevel');
        zoomLevel.textContent = Math.round(this.zoom * 100) + '%';
    }
    
    startDrawing(e) {
        if (!this.socket.connected) return;
        
        this.isDrawing = true;
        const coords = this.getCanvasCoordinates(e);
        const brushSize = document.getElementById('brushSize').value;
        
        // Send draw start event to server
        this.socket.emit('draw-start', {
            x: coords.x,
            y: coords.y,
            color: this.userColor,
            width: parseInt(brushSize)
        });
    }
    
    continueDrawing(e) {
        if (!this.isDrawing || !this.currentStroke || !this.socket.connected) return;
        
        const coords = this.getCanvasCoordinates(e);
        
        // Send draw continue event to server
        this.socket.emit('draw-continue', {
            strokeId: this.currentStroke.id,
            x: coords.x,
            y: coords.y
        });
    }
    
    stopDrawing() {
        if (!this.isDrawing || !this.currentStroke) return;
        
        this.isDrawing = false;
        
        // Send draw end event to server
        this.socket.emit('draw-end', {
            strokeId: this.currentStroke.id
        });
        
        this.currentStroke = null;
    }
    
    updateCursor(e) {
        if (!this.socket.connected) return;
        
        const coords = this.getCanvasCoordinates(e);
        
        // Update cursor position display
        this.updateCursorInfo(coords);
        
        // Throttle cursor updates to avoid overwhelming the server
        if (!this.lastCursorUpdate || Date.now() - this.lastCursorUpdate > 50) {
            this.socket.emit('cursor-move', {
                x: coords.x,
                y: coords.y
            });
            this.lastCursorUpdate = Date.now();
        }
    }
    
    drawStrokeStart(stroke) {
        // Store current stroke if it's ours
        if (this.userInfo && stroke.userId === this.userInfo.id) {
            this.currentStroke = stroke;
        }
        
        // Store all active strokes for proper continuation
        if (!this.activeStrokes) {
            this.activeStrokes = new Map();
        }
        this.activeStrokes.set(stroke.id, stroke);
        
        // Ensure we have the correct transform applied
        this.ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
        
        this.ctx.strokeStyle = stroke.color;
        this.ctx.lineWidth = stroke.width / this.zoom; // Adjust line width for zoom
        this.ctx.beginPath();
        this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    }
    
    drawStrokeContinue(data) {
        // Find the active stroke and continue drawing
        if (this.activeStrokes && this.activeStrokes.has(data.strokeId)) {
            const stroke = this.activeStrokes.get(data.strokeId);
            
            // Ensure we have the correct transform applied
            this.ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
            
            this.ctx.strokeStyle = stroke.color;
            this.ctx.lineWidth = stroke.width / this.zoom; // Adjust line width for zoom
            this.ctx.lineTo(data.x, data.y);
            this.ctx.stroke();
        }
    }
    
    drawStroke(stroke) {
        if (stroke.points.length === 0) return;
        
        this.ctx.strokeStyle = stroke.color;
        this.ctx.lineWidth = stroke.width / this.zoom; // Adjust line width for current zoom
        this.ctx.beginPath();
        this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        
        for (let i = 1; i < stroke.points.length; i++) {
            this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        
        this.ctx.stroke();
    }
    
    redrawCanvas() {
        // This would typically redraw from stored canvas state
        // For now, the server will send the complete state on reconnect
    }
    
    clearCanvas(emit = true) {
        // Clear with reset transform to ensure entire canvas is cleared
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        
        // Restore current transform
        this.ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
        
        if (emit) {
            this.socket.emit('clear-canvas');
        }
    }
    
    updateRemoteCursor(data) {
        let cursor = this.userCursors.get(data.userId);
        
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'cursor';
            cursor.style.backgroundColor = data.color;
            document.body.appendChild(cursor);
            this.userCursors.set(data.userId, cursor);
        }
        
        const rect = this.canvas.getBoundingClientRect();
        cursor.style.left = (rect.left + data.x - 5) + 'px';
        cursor.style.top = (rect.top + data.y - 5) + 'px';
        cursor.style.display = 'block';
        
        // Hide cursor after a delay if no movement
        clearTimeout(cursor.hideTimeout);
        cursor.hideTimeout = setTimeout(() => {
            cursor.style.display = 'none';
        }, 2000);
    }
    
    removeUserCursor(userId) {
        const cursor = this.userCursors.get(userId);
        if (cursor) {
            cursor.remove();
            this.userCursors.delete(userId);
        }
    }
    
    updateConnectionStatus(connected) {
        const status = document.getElementById('connectionStatus');
        if (connected) {
            status.textContent = 'Connected';
            status.className = 'status-badge connected';
        } else {
            status.textContent = 'Disconnected';
            status.className = 'status-badge disconnected';
        }
    }
    
    updateUserCount() {
        const userCount = document.getElementById('userCount');
        const count = this.connectedUsers.size;
        userCount.textContent = `${count} ${count === 1 ? 'User' : 'Users'}`;
    }
    
    updateCursorInfo(coords) {
        const cursorInfo = document.getElementById('cursorInfo');
        const cursorX = document.getElementById('cursorX');
        const cursorY = document.getElementById('cursorY');
        
        cursorX.textContent = Math.round(coords.x);
        cursorY.textContent = Math.round(coords.y);
        
        cursorInfo.classList.add('visible');
        
        // Hide cursor info after a delay
        clearTimeout(this.cursorInfoTimeout);
        this.cursorInfoTimeout = setTimeout(() => {
            cursorInfo.classList.remove('visible');
        }, 2000);
    }
    
    // Chat functionality
    toggleChat() {
        const chatPanel = document.getElementById('chatPanel');
        this.chatOpen = !this.chatOpen;
        
        if (this.chatOpen) {
            chatPanel.classList.add('open');
            // Auto-focus input when opening
            setTimeout(() => {
                document.getElementById('chatInput').focus();
            }, 300);
        } else {
            chatPanel.classList.remove('open');
        }
    }
    
    sendChatMessage() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (message && this.socket.connected) {
            this.socket.emit('chat-message', {
                message: message,
                timestamp: Date.now()
            });
            
            chatInput.value = '';
        }
    }
    
    displayChatMessage(data) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message ' + (data.userId === this.userInfo?.id ? 'own' : 'other');
        
        const timestamp = new Date(data.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const userName = data.userId === this.userInfo?.id ? 'You' : `User ${data.userId.slice(-6)}`;
        
        messageDiv.innerHTML = `
            <div class="user-name" style="color: ${data.userColor || '#666'}">${userName}</div>
            <div class="message-text">${this.escapeHtml(data.message)}</div>
            <div class="timestamp">${timestamp}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Show notification if chat is closed
        if (!this.chatOpen) {
            this.showChatNotification();
        }
    }
    
    showChatNotification() {
        const toggleChat = document.getElementById('toggleChat');
        toggleChat.style.animation = 'pulse 0.5s ease-in-out 3';
        
        setTimeout(() => {
            toggleChat.style.animation = '';
        }, 1500);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    redrawCanvas() {
        // Clear the entire canvas first
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        
        // Apply zoom and pan transform
        this.ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
        
        // Redraw all strokes from local storage
        if (this.canvasStrokes) {
            this.canvasStrokes.forEach(stroke => {
                this.drawStroke(stroke);
            });
        }
    }
    
    initializeTheme() {
        const savedTheme = localStorage.getItem('canvas-theme') || 'light';
        this.setTheme(savedTheme);
    }
    
    setTheme(theme) {
        const body = document.body;
        const themeButton = document.getElementById('themeToggle');
        const themeIcon = themeButton.querySelector('span');
        
        if (theme === 'dark') {
            body.setAttribute('data-theme', 'dark');
            themeIcon.textContent = '☀️';
            themeButton.childNodes[1].textContent = ' Light Mode';
        } else {
            body.removeAttribute('data-theme');
            themeIcon.textContent = '🌙';
            themeButton.childNodes[1].textContent = ' Dark Mode';
        }
        
        // saves it locally
        localStorage.setItem('canvas-theme', theme);
        this.currentTheme = theme;
    }
    
    toggleTheme() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }
}

// Initialize the collaborative canvas when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new CollaborativeCanvas();
});