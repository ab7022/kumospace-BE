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
let messages = []; // Store messages in memory for cleanup logic
let users2 = {}; // Store users with socket ID as the key
let groupMessages = []; // Store group messages
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
  socket.on("call:end", ({ to }) => {
    io.to(to).emit("call:ended");
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
  socket.on("joinRoom", (user) => {
    const spaceCode = user.spaceCode;
    socket.join(spaceCode);
    console.log(`User joined room: ${spaceCode}`);
    const relevantMessages = groupMessages.filter((message) => {
      const currentTime = Date.now();
      return (
        (message.code === user.spaceCode) &&
        currentTime - message.timestamp <= 30 * 60 * 1000 // 30 minutes filter
      );
    });

    // Send previous relevant messages to the newly connected user
    socket.emit("previousMessagesForGroup", relevantMessages);
  });
  socket.on("group-message", (message) => {
    const date = new Date();
    const messageObject = {
      senderEmail: message.senderEmail,
      name : message.name,
      timestamp: date,
      image: message.image,
      text: message.text,
      name: message.name,
      code: message.code,
    };
    groupMessages.push(messageObject);

    io.to(messageObject.code).emit("receive-group-message", messageObject);
  });
  // Register user on connection
  socket.on("registerForMessage", (user) => {
  // Remove old users with the same email
  Object.keys(users2).forEach((key) => {
    if (users2[key].email === user.email) {
      delete users2[key]; // Remove the old user with the same email
    }
  });

  // Add the new user
  users2[socket.id] = { email: user.email, id: socket.id,
    name:user.name,
    image:user.image,
   };
  console.log(`${user.email} connected with socket ID: ${socket.id}`);
  console.log(`Active connections: ${Object.keys(users2).length}`);
  console.log("users2", users2);
  // Fetch messages from the last 30 minutes for the registered user
    const relevantMessages = messages.filter((message) => {
      const currentTime = Date.now();
      return (
        (message.senderEmail === user.email ||
          message.recipientEmail === user.email) &&
        currentTime - message.timestamp <= 30 * 60 * 1000 // 30 minutes filter
      );
    });

    // Send previous relevant messages to the newly connected user
    socket.emit("previousMessages", relevantMessages);
    
  });

  // Listen for sending messages
  socket.on("sendMessage", (message) => {
    const { email, text } = message;
  
    const date = new Date();
    const messageObject = {
      senderEmail: users2[socket.id].email, 
      image: users2[socket.id].image,
      name: users2[socket.id].name,
      recipientEmail: email, 
      text,
      timestamp: date,
    };

    messages.push(messageObject);
    console.log("messageObject", messageObject);

    // Find the recipient's socket ID based on their email
    const recipientSocketId = Object.keys(users2).find((key) => {
      return users2[key].email === email; // Explicitly return the comparison result
    });
    // If recipient is found, send the message to them
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("receiveMessage", messageObject);
    }

    // Send the message back to the sender as well
    socket.emit("receiveMessage", messageObject);

    // Cleanup old messages
    setTimeout(cleanupMessages, 20 * 60 * 1000);
    setTimeout(cleanupMessagesForGroup, 20 * 60 * 1000);
  });
});
function cleanupMessages() {
  const currentTime = Date.now();
  messages = messages.filter((message) => {
    // Extract the numeric timestamp from the Date object
    const messageTime = new Date(message.timestamp).getTime();
    return currentTime - messageTime < 30 * 60 * 1000; // 30 minutes filter
  });
}

function cleanupMessagesForGroup() {
  const currentTime = Date.now();
  messages = groupMessages.filter((message) => {
    // Extract the numeric timestamp from the Date object
    const messageTime = new Date(message.timestamp).getTime();
    return currentTime - messageTime < 30 * 60 * 1000; // 30 minutes filter
  });
}

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
