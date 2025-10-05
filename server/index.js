import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { createServer } from "http";
import bodyParser from "body-parser";
import { Server } from "socket.io";
import twilio from "twilio";

const app = express();
const server = createServer(app);

app.use(bodyParser.json());

// Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
// console.log(accountSid, authToken);
const client = twilio(accountSid, authToken);

const allowedOrigins = [
    "https://video-chat-app-2-ki3scrodu-atultiwari000s-projects.vercel.app",
    "https://video-chat-app-2-green.vercel.app",
  "http://localhost:3000" 
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Allow all origins temporarily to test
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Add explicit transports
  allowEIO3: true // Add for compatibility
});

// const userToSocketIdMap = new Map();
// const socketIdToUserMap = new Map();
// const disconnectTimers = new Map();
const roomMessages = new Map(); 

app.get('/', (req, res) => {
  res.send('Server is running');
});

io.on('connection', (socket) => {
    // console.log('User connected:', socket.id);
    
    socket.on("room:join", ({ room, userName }) => {
        const cleanRoom = String(room).trim();
        
        // Check room size BEFORE allowing join
        const clientsInRoom = io.sockets.adapter.rooms.get(cleanRoom);
        const clientCount = clientsInRoom ? clientsInRoom.size : 0;
        
        // console.log(`Room ${cleanRoom} has ${clientCount} users. ${userName} trying to join.`);
        
        // Reject if room already has 2 users
        if (clientCount >= 2) {
            // console.log(`Room ${cleanRoom} is full. Rejecting ${socket.id}`);
            socket.emit("room:full", {
                room: cleanRoom,
                message: "This room is full. Maximum 2 participants allowed."
            });
            return; // Don't proceed with join
        }
        
        // Store validated room and user data
        socket.data.userName = userName;
        socket.data.room = cleanRoom;
        socket.join(cleanRoom);
        
        // console.log(`${userName} (${socket.id}) successfully joined room: ${cleanRoom}`);

        // Get updated list of all clients in the room (including the one who just joined)
        const updatedClientsInRoom = io.sockets.adapter.rooms.get(cleanRoom) || new Set();
        const usersInRoom = [];
        updatedClientsInRoom.forEach(socketId => {
            const userSocket = io.sockets.sockets.get(socketId);
            if (userSocket) {
                usersInRoom.push({
                    id: userSocket.id,
                    userName: userSocket.data.userName || "Unknown"
                });
            }
        });

        // console.log(`Total users in room ${cleanRoom}:`, usersInRoom.length);
        
        // 1. Tell the user who just joined about everyone in the room
        socket.emit("room:joined", { users: usersInRoom });

        // 2. Tell everyone else in the room that a new user has joined
        socket.to(cleanRoom).emit("user:joined", {
            id: socket.id,
            userName: userName
        });
    });

    // Handle user leaving gracefully
    const handleLeave = (reason, room) => {
        const userName = socket.data.userName;
        
        if (!room || !userName) {
            return;
        }
        
        // console.log(`${userName} (${socket.id}) leaving room ${room}. Reason: ${reason}`);

        socket.to(room).emit("user:left", { id: socket.id, userName });
        socket.leave(room);
        
        // Clear stored data
        socket.data.room = null;
        socket.data.userName = null;
        
        // Log updated room size
        const remainingClients = io.sockets.adapter.rooms.get(room);
        const remainingCount = remainingClients ? remainingClients.size : 0;
        // console.log(`Room ${room} now has ${remainingCount} users`);
    };
    
    socket.on('disconnect', () => {
        const room = socket.data.room;
        // console.log('User disconnected:', socket.id);
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
        // console.log(`Call from ${socket.id} to ${to}`);
        io.to(to).emit("incoming:call", { from: socket.id, offer, userName });
    });

    socket.on("call:accepted", ({ to, ans, userName }) => {
        // console.log(`Call accepted by ${socket.id} to ${to}`);
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
            // console.log(`Call ended by ${socket.id} to ${to}`);
            io.to(to).emit("call:ended", { from: socket.id });
        }
    });

    // Handle chat messages
    socket.on("chat:message", ({ room, message, userName }) => {
        // console.log(`Chat message in room ${room} from ${userName}`);
        
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
    console.error('Connection error:', err.code, err.message);
});

// Endpoint to get ICE servers
app.get("/ice-servers", async (req, res) => {
  try {
    const token = await client.tokens.create(); // creates an Access Token
    res.json({ iceServers: token.iceServers });
  } catch (err) {
    console.error("Error fetching Twilio ICE servers:", err);
    res.status(500).send("Failed to get ICE servers");
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
