// Server - index.ts
// This is the signaling server that helps two peers find each other
// It also manages rooms, chat messages, and provides TURN/STUN servers

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import bodyParser from "body-parser";
import { Server } from "socket.io";
import twilio from "twilio";
import cors from "cors";

// Create Express app (handles HTTP requests)
const app = express();

// Create HTTP server (Socket.IO needs this)
const server = createServer(app);

// Parse JSON bodies in requests
app.use(bodyParser.json());

// -- Twilio Setup --
// Twilio provides TURN/STUN servers for NAT traversal
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// -- CORS Configuration --
// List of allowed origins (your frontend URLs)
const allowedOrigins = [
    "https://video-chat-app-2-ki3scrodu-atultiwari000s-projects.vercel.app",
    "https://video-chat-app-2-green.vercel.app",
    "http://localhost:3000", 
    /\.vercel\.app$/ // Regex to allow any vercel.app subdomain
];

// Configure CORS for Express (allows frontend to make HTTP requests)
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in our allowed list
    if (typeof allowedOrigins.find(allowed => {
      if (allowed instanceof RegExp) return allowed.test(origin);
      return allowed === origin;
    }) !== 'undefined') {
      callback(null, true); // Allow the request
    } else {
      callback(new Error('Not allowed by CORS')); // Reject the request
    }
  },
  credentials: true, // Allow cookies to be sent
}));

// -- Socket.IO Setup --
// Create Socket.IO server for real-time communication
const io = new Server(server, {
  cors: {
    // Same CORS logic for Socket.IO connections
    origin: function(origin, callback) {
      if (!origin) return callback(null, true);
      
      if (typeof allowedOrigins.find(allowed => {
        if (allowed instanceof RegExp) return allowed.test(origin);
        return allowed === origin;
      }) !== 'undefined') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"], // Allowed HTTP methods
    credentials: true
  },
  // Transport configuration
  transports: ['polling', 'websocket'],
  allowEIO3: true, // Allow older Socket.IO clients
  pingTimeout: 60000, // Wait 60s for ping response before disconnecting
  pingInterval: 25000 // Send ping every 25s to keep connection alive
});

// -- In-Memory Storage --
// Map to store chat messages for each room
// Key: room ID, Value: array of message objects
const roomMessages = new Map(); 

// -- HTTP Endpoints --

// Basic health check endpoint
app.get('/', (req, res) => {
  res.send('Server is running');
});

// Endpoint to get TURN/STUN servers from Twilio
app.get("/ice-servers", async (req, res) => {
  try {
    // Request temporary credentials from Twilio
    const token = await client.tokens.create();
    
    // Return the ICE servers to the client
    res.json({ iceServers: token.iceServers });
  } catch (err) {
    console.error("Error fetching Twilio ICE servers:", err);
    res.status(500).send("Failed to get ICE servers");
  }
});

// -- Socket.IO Event Handlers --

// Event: New client connected
io.on('connection', (socket) => {
    // console.log('User connected:', socket.id);
    
    // Event: User wants to join a room
    socket.on("room:join", ({ room, userName }) => {
        // Clean up room ID (remove extra spaces)
        const cleanRoom = String(room).trim();
        
        // Check how many users are already in the room
        const clientsInRoom = io.sockets.adapter.rooms.get(cleanRoom);
        const clientCount = clientsInRoom ? clientsInRoom.size : 0;
        
        // console.log(`Room ${cleanRoom} has ${clientCount} users. ${userName} trying to join.`);
        
        // Enforce room limit: maximum 2 users per room
        if (clientCount >= 2) {
            // console.log(`Room ${cleanRoom} is full. Rejecting ${socket.id}`);
            
            // Send error to the user trying to join
            socket.emit("room:full", {
                room: cleanRoom,
                message: "This room is full. Maximum 2 participants allowed."
            });
            return; // Don't let them join
        }
        
        // Store user data on the socket object
        socket.data.userName = userName;
        socket.data.room = cleanRoom;
        
        // Add user to the room
        socket.join(cleanRoom);
        
        // console.log(`${userName} (${socket.id}) successfully joined room: ${cleanRoom}`);

        // Get list of all users now in the room
        const updatedClientsInRoom = io.sockets.adapter.rooms.get(cleanRoom) || new Set();
        const usersInRoom = [];
        
        // Build array of user info for everyone in the room
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

    // Helper function to handle user leaving a room
    const handleLeave = (reason, room) => {
        const userName = socket.data.userName;
        
        // If no room or userName, nothing to do
        if (!room || !userName) {
            return;
        }
        
        // console.log(`${userName} (${socket.id}) leaving room ${room}. Reason: ${reason}`);

        // Notify everyone else in the room that this user left
        socket.to(room).emit("user:left", { id: socket.id, userName });
        
        // Remove user from the room
        socket.leave(room);
        
        // Clear user data
        socket.data.room = null;
        socket.data.userName = null;
        
        // Log how many users remain
        const remainingClients = io.sockets.adapter.rooms.get(room);
        const remainingCount = remainingClients ? remainingClients.size : 0;
        // console.log(`Room ${room} now has ${remainingCount} users`);
    };
    
    // Event: User disconnected (browser closed, network lost, etc.)
    socket.on('disconnect', () => {
        const room = socket.data.room;
        // console.log('User disconnected:', socket.id);
        handleLeave('native disconnect', room);
    });

    // Event: User explicitly left the room
    socket.on("leave:room", () => {
        const room = socket.data.room;
        const userName = socket.data.userName;
        
        if (!room || !userName) {
            return;
        }
        
        handleLeave('explicit leave', room);
    });

    // -- Call Signaling Events --
    // These events help establish WebRTC peer connections

    // Event: User wants to call another user
    socket.on("user:call", ({ to, offer, userName }) => {
        // console.log(`Call from ${socket.id} to ${to}`);
        
        // Forward the offer (SDP) to the target user
        // The offer describes what media we want to send/receive
        io.to(to).emit("incoming:call", { from: socket.id, offer, userName });
    });

    // Event: User accepted an incoming call
    socket.on("call:accepted", ({ to, ans, userName }) => {
        // console.log(`Call accepted by ${socket.id} to ${to}`);
        
        // Forward the answer (SDP) back to the caller
        // The answer completes the offer/answer exchange
        io.to(to).emit("call:accepted", { 
            from: socket.id, 
            ans, 
            userName: userName || socket.data.userName 
        });
    });

    // -- Peer Negotiation Events --
    // Sometimes peers need to renegotiate (e.g., when adding/removing tracks)

    // Event: Peer needs to renegotiate the connection
    socket.on("peer:nego:needed", ({ to, offer }) => {
        // Forward the new offer to the other peer
        io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
    });

    // Event: Peer responded to renegotiation
    socket.on("peer:nego:done", ({ to, ans }) => {
        // Forward the answer back to complete renegotiation
        io.to(to).emit("peer:nego:final", { from: socket.id, ans });
    });

    // -- ICE Candidate Events --
    // ICE candidates are network addresses where peers can be reached

    // Event: Peer found a new ICE candidate
    socket.on("ice:candidate", ({ to, candidate }) => {
        // Forward the ICE candidate to the other peer
        io.to(to).emit("ice:candidate", { 
            from: socket.id, 
            candidate 
        });
    });

    // -- Call Management Events --

    // Event: User ended the call
    socket.on("call:end", ({ to }) => {
        if (to) {
            // console.log(`Call ended by ${socket.id} to ${to}`);
            
            // Notify the other peer that the call ended
            io.to(to).emit("call:ended", { from: socket.id });
        }
    });

    // -- Chat Events --

    // Event: User sent a chat message
    socket.on("chat:message", ({ room, message, userName }) => {
        // console.log(`Chat message in room ${room} from ${userName}`);
        
        // Store message in memory for this room
        if (!roomMessages.has(room)) {
            roomMessages.set(room, []); // Create array if room is new
        }
        
        // Create message object with metadata
        const messageData = {
            id: Date.now(), // Simple unique ID using timestamp
            sender: userName,
            text: message,
            timestamp: new Date(),
        };
        
        // Add message to room's message history
        roomMessages.get(room).push(messageData);
        
        // Broadcast message to everyone in the room (including sender)
        io.to(room).emit("chat:message", messageData);
    });
});

// -- Error Handling --

// Handle Socket.IO connection errors
io.engine.on("connection_error", (err) => {
    console.error('Connection error:', err.code, err.message);
});

// -- Start Server --

const PORT = process.env.PORT || 5000;

// Listen on all network interfaces (0.0.0.0) for deployment compatibility
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});