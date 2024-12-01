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
let groups = {}; // Tracks groups and their members

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

  // Private messaging
  socket.on("privateMessage", ({ to, message }) => {
    if (users[to]) {
      io.to(to).emit("privateMessage", {
        from: socket.id,
        name: users[socket.id]?.name,
        message,
      });
    }
  });

  // Group messaging
  socket.on("createGroup", ({ groupName, members }) => {
    groups[groupName] = members;
    members.forEach((memberId) => {
      if (users[memberId]) {
        io.to(memberId).emit("groupCreated", { groupName, members });
      }
    });
  });

  socket.on("groupMessage", ({ groupName, message }) => {
    if (groups[groupName]) {
      groups[groupName].forEach((memberId) => {
        if (users[memberId]) {
          io.to(memberId).emit("groupMessage", {
            groupName,
            from: socket.id,
            name: users[socket.id]?.name,
            message,
          });
        }
      });
    }
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
