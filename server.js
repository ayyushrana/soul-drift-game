const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 8000;

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Game state
let rooms = {};

function createRoom() {
    const roomId = Math.random().toString(36).substr(2, 6);
    rooms[roomId] = {
        players: {},
        orbs: [],
        obstacles: [],
        scores: { p1: 0, p2: 0 },
        started: false
    };
    return roomId;
}

function spawnOrb(width, height) {
    return {
        x: Math.random() * (width-40) + 20,
        y: Math.random() * (height-40) + 20,
        size: 10 + Math.random()*8,
        color: 'yellow',
        id: Math.random().toString(36).substr(2, 8)
    };
}

function spawnObstacle(width, height) {
    return {
        x: width + Math.random()*width,
        y: Math.random() * (height-40) + 20,
        size: 25,
        speed: 2 + Math.random()*2,
        id: Math.random().toString(36).substr(2, 8)
    };
}

io.on('connection', (socket) => {
    let currentRoom = null;
    let playerId = null;

    socket.on('join', ({ roomId, width, height }) => {
        if (!roomId || !rooms[roomId]) {
            roomId = createRoom();
        }
        currentRoom = roomId;
        const room = rooms[roomId];
        playerId = Object.keys(room.players).length === 0 ? 'p1' : 'p2';
        room.players[playerId] = { x: width/3, y: height/2, vx: 0, vy: 0 };
        if (!room.started && Object.keys(room.players).length === 2) {
            // Start game
            room.orbs = [spawnOrb(width, height), spawnOrb(width, height), spawnOrb(width, height)];
            room.obstacles = [spawnObstacle(width, height), spawnObstacle(width, height)];
            room.started = true;
        }
        socket.join(roomId);
        socket.emit('joined', { roomId, playerId });
        io.to(roomId).emit('state', room);
    });

    socket.on('move', ({ x, y }) => {
        if (!currentRoom || !playerId) return;
        const room = rooms[currentRoom];
        if (room && room.players[playerId]) {
            room.players[playerId].x = x;
            room.players[playerId].y = y;
        }
        io.to(currentRoom).emit('state', room);
    });

    socket.on('collect', (orbId) => {
        const room = rooms[currentRoom];
        if (!room) return;
        const orbIdx = room.orbs.findIndex(o => o.id === orbId);
        if (orbIdx !== -1) {
            room.orbs.splice(orbIdx, 1);
            room.orbs.push(spawnOrb(1200, 700)); // Use default size for now
            room.scores[playerId] += 10;
        }
        io.to(currentRoom).emit('state', room);
    });

    socket.on('hit', () => {
        const room = rooms[currentRoom];
        if (!room) return;
        io.to(currentRoom).emit('gameover', playerId);
        delete rooms[currentRoom];
    });

    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            delete rooms[currentRoom].players[playerId];
            if (Object.keys(rooms[currentRoom].players).length === 0) {
                delete rooms[currentRoom];
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}); 