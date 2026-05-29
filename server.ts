import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import path from "path";
import { createServer as createViteServer } from "vite";

interface PlayerDetails {
  id: string; // Socket ID
  name: string;
  games: number;
  betrayals: number;
  avatar: string;
  style: string;
  profileHidden: boolean;
  balance: number;
}

interface MatchRoom {
  roomId: string;
  players: {
    [socketId: string]: {
      details: PlayerDetails;
      action?: "cooperate" | "betray";
      ready: boolean;
    };
  };
  botMode: boolean;
  botDetails?: any;
  status: "matching" | "playing" | "resolved" | "cancelled";
  createdAt: number;
}

const PORT = 3000;

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Configure Socket.io with proper cors and transport settings
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Track players in queue and match active rooms
  let matchQueue: { socket: Socket; details: PlayerDetails }[] = [];
  const activeRooms: Map<string, MatchRoom> = new Map();

  // Simple in-memory global stats to maintain bonus pool
  let globalBonusPool = 750.0;
  const BONUS_POOL_CUT = 0.25;

  app.use(express.json());

  // API returns active server statistics
  app.get("/api/status", (req, res) => {
    res.json({
      onlineCount: io.sockets.sockets.size,
      queueCount: matchQueue.length,
      roomsActive: activeRooms.size,
      globalBonusPool
    });
  });

  // Global broadcaster for updated server stats
  function broadcastServerStats() {
    io.emit("server-stats", {
      onlineCount: io.sockets.sockets.size,
      queueCount: matchQueue.length,
      bonusPool: globalBonusPool
    });
  }

  // Helper to trigger bot matchmaking authoritatively
  function triggerBotMatch(clientSocket: Socket, playerDetails: PlayerDetails) {
    const bots = [
      { name: "QuietFox", games: 43, betrayals: 7, avatar: "🦊", style: "осторожный", profileHidden: false, rate: 16 },
      { name: "IronSmile", games: 88, betrayals: 61, avatar: "😈", style: "агрессивный", profileHidden: true, rate: 69 },
      { name: "MiraTrust", games: 27, betrayals: 2, avatar: "🕊️", style: "доверчивый", profileHidden: false, rate: 7 },
      { name: "ZeroLuck", games: 112, betrayals: 54, avatar: "🎲", style: "хаотичный", profileHidden: false, rate: 48 },
      { name: "BankerCat", games: 64, betrayals: 18, avatar: "🐈", style: "прагматичный", profileHidden: false, rate: 28 },
      { name: "RedWolf", games: 151, betrayals: 119, avatar: "🐺", style: "хищник", profileHidden: true, rate: 79 },
    ];
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const botId = `bot_${Date.now()}`;

    const botDetails: PlayerDetails = {
      id: botId,
      name: bot.name,
      games: bot.games,
      betrayals: bot.betrayals,
      avatar: bot.avatar,
      style: bot.style,
      profileHidden: bot.profileHidden,
      balance: 20
    };

    const roomId = `room_bot_${Date.now()}`;
    const room: MatchRoom = {
      roomId,
      players: {
        [clientSocket.id]: { details: playerDetails, ready: true }
      },
      botMode: true,
      botDetails,
      status: "playing",
      createdAt: Date.now()
    };

    activeRooms.set(roomId, room);
    clientSocket.join(roomId);

    clientSocket.emit("match-found", {
      roomId,
      opponent: botDetails,
      yourRole: "player1"
    });

    console.log(`Match created: Player vs Bot [${playerDetails.name} vs ${bot.name}] in ${roomId}`);
  }

  // Core WebSocket Matchmaking and Game Logic
  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Instantly sync metrics in real-time
    broadcastServerStats();

    socket.on("join-queue", (details: PlayerDetails) => {
      // Clear any existing instances of this socket in queue or active rooms
      matchQueue = matchQueue.filter((q) => q.socket.id !== socket.id);
      
      const playerDetails: PlayerDetails = {
        ...details,
        id: socket.id
      };

      console.log(`Player ${playerDetails.name} joined queue.`);

      // If another real player is in the queue, match them immediately!
      if (matchQueue.length > 0) {
        const opponent = matchQueue.shift()!;
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        const room: MatchRoom = {
          roomId,
          players: {
            [socket.id]: { details: playerDetails, ready: true },
            [opponent.socket.id]: { details: opponent.details, ready: true }
          },
          botMode: false,
          status: "playing",
          createdAt: Date.now()
        };

        activeRooms.set(roomId, room);

        // Put both sockets in the socket room
        socket.join(roomId);
        opponent.socket.join(roomId);

        // Tell both players they have been matched
        socket.emit("match-found", {
          roomId,
          opponent: opponent.details,
          yourRole: "player1"
        });

        opponent.socket.emit("match-found", {
          roomId,
          opponent: playerDetails,
          yourRole: "player2"
        });

        console.log(`Match created: Real player vs Player [${playerDetails.name} vs ${opponent.details.name}] in ${roomId}`);
      } else {
        // Enqueue current user
        matchQueue.push({ socket, details: playerDetails });

        // Backup safety server auto-trigger bot ONLY after 60 seconds of complete idle
        setTimeout(() => {
          const index = matchQueue.findIndex((q) => q.socket.id === socket.id);
          if (index !== -1) {
            const item = matchQueue[index];
            matchQueue.splice(index, 1);
            triggerBotMatch(socket, item.details);
            broadcastServerStats();
          }
        }, 60000);
      }

      broadcastServerStats();
    });

    socket.on("force-bot-match", () => {
      // Find player in queue
      const index = matchQueue.findIndex((q) => q.socket.id === socket.id);
      if (index !== -1) {
        const item = matchQueue[index];
        matchQueue.splice(index, 1);
        triggerBotMatch(socket, item.details);
        broadcastServerStats();
      }
    });

    socket.on("leave-queue", () => {
      matchQueue = matchQueue.filter((q) => q.socket.id !== socket.id);
      console.log(`Player walked away, socket ${socket.id} removed from matchmaking queue.`);
      broadcastServerStats();
    });

    socket.on("leave-room", ({ roomId }: { roomId: string }) => {
      const room = activeRooms.get(roomId);
      if (room) {
        room.status = "cancelled";
        socket.to(roomId).emit("opponent-disconnected", {
          message: "Ваш оппонент решил покинуть дуэль и искать другого игрока."
        });
        activeRooms.delete(roomId);
        socket.leave(roomId);
        console.log(`Socket ${socket.id} explicitly left active room ${roomId}: search another player`);
        broadcastServerStats();
      }
    });

    // Handle submissions on the secure server side to guard against client tampering
    socket.on("submit-action", ({ roomId, action }: { roomId: string; action: "cooperate" | "betray" }) => {
      const room = activeRooms.get(roomId);
      if (!room || room.status !== "playing") return;

      if (room.botMode) {
        // Evaluate player choice vs bot choice
        const playerState = room.players[socket.id];
        if (!playerState) return;

        playerState.action = action;
        
        // Decide bot action authoritatively based on its real historical betrayal rate
        const botRate = room.botDetails.games ? room.botDetails.betrayals / room.botDetails.games : 0.4;
        const botAction: "cooperate" | "betray" = Math.random() < botRate ? "betray" : "cooperate";

        // Resolve game payouts safely
        const results = resolveMatch(action, botAction);
        
        if (results.economy === "asymmetric") {
          globalBonusPool = Number((globalBonusPool + BONUS_POOL_CUT).toFixed(2));
        }

        room.status = "resolved";

        socket.emit("match-result", {
          playerAction: action,
          opponentAction: botAction,
          payout: results.payout,
          opponentPayout: results.opponentPayout,
          title: results.title,
          text: results.text,
          economy: results.economy,
          net: Number((results.payout - 2.0).toFixed(2)),
          bonusPool: globalBonusPool
        });

        activeRooms.delete(roomId);
        console.log(`Match resolved Authoritatively: ${room.players[socket.id].details.name} (${action}) vs Bot ${room.botDetails.name} (${botAction})`);

      } else {
        // Multi-user match! Store choice, and verify if opponent has already moved
        const playerState = room.players[socket.id];
        if (!playerState) return;

        playerState.action = action;

        const otherSocketId = Object.keys(room.players).find((id) => id !== socket.id);
        if (!otherSocketId) return;

        const otherPlayerState = room.players[otherSocketId];
        
        if (otherPlayerState.action) {
          // Both have chosen! Compute results authoritatively
          const results = resolveMatch(playerState.action, otherPlayerState.action);
          
          if (results.economy === "asymmetric") {
            globalBonusPool = Number((globalBonusPool + BONUS_POOL_CUT).toFixed(2));
          }

          room.status = "resolved";

          // Broadcast custom payouts to both players safely
          io.to(socket.id).emit("match-result", {
            playerAction: playerState.action,
            opponentAction: otherPlayerState.action,
            payout: results.payout,
            opponentPayout: results.opponentPayout,
            title: results.title,
            text: results.text,
            economy: results.economy,
            net: Number((results.payout - 2.0).toFixed(2)),
            bonusPool: globalBonusPool
          });

          // Inverse perspective for the opponent
          const opponentResults = resolveMatch(otherPlayerState.action, playerState.action);
          io.to(otherSocketId).emit("match-result", {
            playerAction: otherPlayerState.action,
            opponentAction: playerState.action,
            payout: opponentResults.payout,
            opponentPayout: opponentResults.opponentPayout,
            title: opponentResults.title,
            text: opponentResults.text,
            economy: opponentResults.economy,
            net: Number((opponentResults.payout - 2.0).toFixed(2)),
            bonusPool: globalBonusPool
          });

          activeRooms.delete(roomId);
          console.log(`Match resolved Authoritatively: ${playerState.details.name} vs ${otherPlayerState.details.name}`);
        } else {
          // Inform the player that we are awaiting opponent's movement
          socket.emit("waiting-for-opponent");
          // Inform opponent of selection, keeping tactical privacy (do not leak exact choice)
          io.to(otherSocketId).emit("opponent-submitted");
        }
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
      matchQueue = matchQueue.filter((q) => q.socket.id !== socket.id);

      // Notify and clean up any room where this player was active
      for (const [roomId, room] of activeRooms.entries()) {
        if (room.players[socket.id]) {
          room.status = "cancelled";
          socket.to(roomId).emit("opponent-disconnected", {
            message: "Ваш оппонент отключился от защищенной трансляции."
          });
          activeRooms.delete(roomId);
        }
      }
      broadcastServerStats();
    });
  });

  // Authoritative Prisoner's Dilemma resolver
  function resolveMatch(playerAction: "cooperate" | "betray", opponentAction: "cooperate" | "betray") {
    const COOPERATION_PAYOUT = 2.1;
    const SOLO_BETRAYAL_PAYOUT = 3.5;
    const DOUBLE_BETRAYAL_PAYOUT = 2.0;

    if (playerAction === "cooperate" && opponentAction === "cooperate") {
      return {
        payout: COOPERATION_PAYOUT,
        opponentPayout: COOPERATION_PAYOUT,
        title: "Взаимное доверие",
        text: "Вы оба сотрудничали и получили небольшой плюс. Для платформы это небольшой минус.",
        economy: "coop",
      };
    }

    if (playerAction === "betray" && opponentAction === "cooperate") {
      return {
        payout: SOLO_BETRAYAL_PAYOUT,
        opponentPayout: 0,
        title: "Ты предал первым",
        text: "Соперник доверился, ты забрал выигрыш. Часть разницы ушла в бонусный фонд Лиги доверия.",
        economy: "asymmetric",
      };
    }

    if (playerAction === "cooperate" && opponentAction === "betray") {
      return {
        payout: 0,
        opponentPayout: SOLO_BETRAYAL_PAYOUT,
        title: "Тебя предали",
        text: "Ты выбрал доверие, но соперник забрал выигрыш. Часть разницы ушла в бонусный фонд Лиги доверия.",
        economy: "asymmetric",
      };
    }

    return {
      payout: DOUBLE_BETRAYAL_PAYOUT,
      opponentPayout: DOUBLE_BETRAYAL_PAYOUT,
      title: "Двойное предательство",
      text: "Оба не рискнули довериться. Деньги просто вернулись, бонусный фонд не пополнился.",
      economy: "double_betrayal",
    };
  }

  // Vite Integration for Dev vs Static build outputs for prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Trust Duel Server running on http://localhost:${PORT}`);
  });
}

startServer();
