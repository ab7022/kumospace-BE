const { Server } = require("socket.io");
const express = require("express");
const app = express();
const httpServer = require("http").createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let users = {}; // Tracks connected users

const emailToSocketIdMap = new Map();
const socketidToEmailMap = new Map();
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User registration
  socket.on("register", (userData) => {
    users[socket.id] = {
      id: socket.id,
      image: userData.image,
      name: userData.name,
      position: userData.position || { x: 0, y: 0 },
      onCurrentlyWorking: userData.onCurrentlyWorking,
      status: userData.status,
      email: userData.email,
      teamName: userData.teamName,
      designation: userData.designation,
      timezone: userData.timezone,
      lastActive: Date.now(),

    };
    console.log(`User registered: ${userData.name} ${userData.status} `);
    io.emit("users", users); // Broadcast updated user list
  });

  // Position updates
  socket.on("updatePosition", (position) => {
    if (users[socket.id]) {
      users[socket.id].position = position;
      users[socket.id].lastActive = Date.now();
      io.emit("users", users); // Broadcast updated user list
    }
  });
  socket.on('call:end', ({ to }) => {
    io.to(to).emit('call:ended');
  });
 

  socket.on("room:join", (data) => {
    const { email, room } = data;
    emailToSocketIdMap.set(email, socket.id);
    socketidToEmailMap.set(socket.id, email);
    io.to(room).emit("user:joined", { email, id: socket.id });
    console.log(`User ${email} joined room ${room}`);
    
    socket.join(room);
    io.to(socket.id).emit("room:join", data);
  });

  socket.on("user:call", ({ to, offer }) => {
    io.to(to).emit("incomming:call", { from: socket.id, offer });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    console.log("peer:nego:needed", offer);
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    console.log("peer:nego:done", ans);
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });

  socket.on("user:screenShare", ({ to, offer }) => {
    io.to(to).emit("incomming:screenShare", { from: socket.id, offer });
  });

  // Disconnection
  socket.on("disconnect", () => {
    if (users[socket.id]) {
      delete users[socket.id];
      io.emit("users", users); // Broadcast updated user list
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Clean up inactive users periodically
setInterval(() => {
  const now = Date.now();
  Object.entries(users).forEach(([userId, user]) => {
    if (now - user.lastActive > 5 * 60 * 1000) {
      delete users[userId];
    }
  });
  io.emit("users", users);
}, 60 * 1000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`You are so close to your dream job! http://localhost:${PORT}`);
});
