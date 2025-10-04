const express = require('express');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');

const io = new Server(8000, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const app = express();
app.use(bodyParser.json());

const userToSocketIdMap = new Map();
const socketIdToUserMap = new Map();
const disconnectTimers = new Map();
const roomMessages = new Map(); 

io.on('connection', (socket) => {
    
    socket.on("room:join", ({ room, userName }) => {
        const cleanRoom = String(room).trim();
        
        
        // Store validated room
        socket.data.userName = userName;
        socket.data.room = cleanRoom;
        socket.join(cleanRoom);

        // Get a list of all clients in the room
        const clientsInRoom = io.sockets.adapter.rooms.get(room) || new Set();
        const usersInRoom = [];
        clientsInRoom.forEach(socketId => {
            const userSocket = io.sockets.sockets.get(socketId);
            if (userSocket) {
                usersInRoom.push({
                    id: userSocket.id,
                    userName: userSocket.data.userName || "Unknown"
                });
            }
        });

        
        // 1. Tell the user who just joined about the others already in the room
        socket.emit("room:joined", { users: usersInRoom });

        // 2. Tell everyone else in the room that a new user has joined
        socket.to(room).emit("user:joined", {
            id: socket.id,
            userName: userName
        });
    });

    // Handle user leaving gracefully
    const handleLeave = (reason, room) => {
    // const room = socket.data.room;  // Use stored value, not from event
    const userName = socket.data.userName;
    
    if (!room || !userName) {
        return;
    }
    

    socket.to(room).emit("user:left", { id: socket.id, userName });
    socket.leave(room);
    
    socket.data.room = null;
    socket.data.userName = null;
    };
    
    socket.on('disconnect', () => {
        const room = socket.data.room;
        handleLeave('native disconnect', room);
    });

    socket.on("leave:room", () => {
        const room = socket.data.room;
        const userName = socket.data.userName;
        
        
        if (!room || !userName) {
            return;
        }
        
        handleLeave('explicit leave', room);
    });

    // Call signaling
    socket.on("user:call", ({ to, offer, userName }) => {
    io.to(to).emit("incoming:call", { from: socket.id, offer, userName });
    });

    socket.on("call:accepted", ({ to, ans, userName }) => {
    // Use the userName passed from client, not from map
    io.to(to).emit("call:accepted", { 
        from: socket.id, 
        ans, 
        userName: userName || socket.data.userName 
    });
    });

    // Peer negotiation signaling
    socket.on("peer:nego:needed", ({ to, offer }) => {
        io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
    });

    socket.on("peer:nego:done", ({ to, ans }) => {
        io.to(to).emit("peer:nego:final", { from: socket.id, ans });
    });

    // Handle ICE candidates
    socket.on("ice:candidate", ({ to, candidate }) => {
        io.to(to).emit("ice:candidate", { 
            from: socket.id, 
            candidate 
        });
    });

    // Handle call end
    socket.on("call:end", ({ to }) => {
        if (to) {
            io.to(to).emit("call:ended", { from: socket.id });
        }
    });

    socket.on("chat:message", ({ room, message, userName }) => {
    
    // Store in memory
    if (!roomMessages.has(room)) {
        roomMessages.set(room, []);
    }
    
    const messageData = {
        id: Date.now(),
        sender: userName,
        text: message,
        timestamp: new Date(),
    };
    
    roomMessages.get(room).push(messageData);
    
    // Broadcast to everyone in the room (including sender)
    io.to(room).emit("chat:message", messageData);
    });
});

// Handle server errors
io.engine.on("connection_error", (err) => {
    // console.log('Connection error:', err.req, err.code, err.message, err.context);
});
