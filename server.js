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

// Store user data with additional information
let users = {};

// Handle all socket connections
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user registration
  socket.on("register", (userData) => {
    console.log(`User registered: ${socket.id}`, userData);

    users[socket.id] = {
      id: socket.id,
      name: userData.name,
      position: userData.position || { x: 0, y: 0 },
      status: "online",
      lastActive: Date.now(),
    };

    // Broadcast updated users list to all clients
    io.emit("users", users);
  });

  // Handle position updates
  socket.on("updatePosition", (position) => {
    console.log(`Position update from ${socket.id}:`, position);

    if (users[socket.id]) {
      users[socket.id].position = {
        x: position.x,
        y: position.y,
      };
      users[socket.id].lastActive = Date.now();

      // Broadcast updated positions to all clients
      io.emit("users", users);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    if (users[socket.id]) {
      delete users[socket.id];
      io.emit("users", users);
    }
  });
});

// Clean up inactive users periodically
setInterval(() => {
  const now = Date.now();
  let hasChanges = false;

  Object.entries(users).forEach(([userId, user]) => {
    if (now - user.lastActive > 5 * 60 * 1000) {
      // 5 minutes timeout
      delete users[userId];
      hasChanges = true;
    }
  });

  if (hasChanges) {
    io.emit("users", users);
  }
}, 60 * 1000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
