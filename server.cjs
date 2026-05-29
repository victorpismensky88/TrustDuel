var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = require("http");
var import_socket = require("socket.io");
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var PORT = 3e3;
async function startServer() {
  const app = (0, import_express.default)();
  const server = (0, import_http.createServer)(app);
  const io = new import_socket.Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  let matchQueue = [];
  const activeRooms = /* @__PURE__ */ new Map();
  let globalBonusPool = 750;
  const BONUS_POOL_CUT = 0.25;
  app.use(import_express.default.json());
  app.get("/api/status", (req, res) => {
    res.json({
      onlineCount: io.sockets.sockets.size,
      queueCount: matchQueue.length,
      roomsActive: activeRooms.size,
      globalBonusPool
    });
  });
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    socket.emit("server-stats", {
      onlineCount: io.sockets.sockets.size,
      bonusPool: globalBonusPool
    });
    socket.on("join-queue", (details) => {
      matchQueue = matchQueue.filter((q) => q.socket.id !== socket.id);
      const playerDetails = {
        ...details,
        id: socket.id
      };
      console.log(`Player ${playerDetails.name} joined queue.`);
      if (matchQueue.length > 0) {
        const opponent = matchQueue.shift();
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const room = {
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
        socket.join(roomId);
        opponent.socket.join(roomId);
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
        matchQueue.push({ socket, details: playerDetails });
        setTimeout(() => {
          const index = matchQueue.findIndex((q) => q.socket.id === socket.id);
          if (index !== -1) {
            matchQueue.splice(index, 1);
            const bots = [
              { name: "QuietFox", games: 43, betrayals: 7, avatar: "\u{1F98A}", style: "\u043E\u0441\u0442\u043E\u0440\u043E\u0436\u043D\u044B\u0439", profileHidden: false, rate: 16 },
              { name: "IronSmile", games: 88, betrayals: 61, avatar: "\u{1F608}", style: "\u0430\u0433\u0440\u0435\u0441\u0441\u0438\u0432\u043D\u044B\u0439", profileHidden: true, rate: 69 },
              { name: "MiraTrust", games: 27, betrayals: 2, avatar: "\u{1F54A}\uFE0F", style: "\u0434\u043E\u0432\u0435\u0440\u0447\u0438\u0432\u044B\u0439", profileHidden: false, rate: 7 },
              { name: "ZeroLuck", games: 112, betrayals: 54, avatar: "\u{1F3B2}", style: "\u0445\u0430\u043E\u0442\u0438\u0447\u043D\u044B\u0439", profileHidden: false, rate: 48 },
              { name: "BankerCat", games: 64, betrayals: 18, avatar: "\u{1F408}", style: "\u043F\u0440\u0430\u0433\u043C\u0430\u0442\u0438\u0447\u043D\u044B\u0439", profileHidden: false, rate: 28 },
              { name: "RedWolf", games: 151, betrayals: 119, avatar: "\u{1F43A}", style: "\u0445\u0438\u0449\u043D\u0438\u043A", profileHidden: true, rate: 79 }
            ];
            const bot = bots[Math.floor(Math.random() * bots.length)];
            const botId = `bot_${Date.now()}`;
            const botDetails = {
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
            const room = {
              roomId,
              players: {
                [socket.id]: { details: playerDetails, ready: true }
              },
              botMode: true,
              botDetails,
              status: "playing",
              createdAt: Date.now()
            };
            activeRooms.set(roomId, room);
            socket.join(roomId);
            socket.emit("match-found", {
              roomId,
              opponent: botDetails,
              yourRole: "player1"
            });
            console.log(`Match created: Player vs Bot [${playerDetails.name} vs ${bot.name}] in ${roomId}`);
          }
        }, 15e3);
      }
    });
    socket.on("leave-queue", () => {
      matchQueue = matchQueue.filter((q) => q.socket.id !== socket.id);
      console.log(`Player walked away, socket ${socket.id} removed from matchmaking queue.`);
    });
    socket.on("leave-room", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (room) {
        room.status = "cancelled";
        socket.to(roomId).emit("opponent-disconnected", {
          message: "\u0412\u0430\u0448 \u043E\u043F\u043F\u043E\u043D\u0435\u043D\u0442 \u0440\u0435\u0448\u0438\u043B \u043F\u043E\u043A\u0438\u043D\u0443\u0442\u044C \u0434\u0443\u044D\u043B\u044C \u0438 \u0438\u0441\u043A\u0430\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0438\u0433\u0440\u043E\u043A\u0430."
        });
        activeRooms.delete(roomId);
        socket.leave(roomId);
        console.log(`Socket ${socket.id} explicitly left active room ${roomId}: search another player`);
      }
    });
    socket.on("submit-action", ({ roomId, action }) => {
      const room = activeRooms.get(roomId);
      if (!room || room.status !== "playing") return;
      if (room.botMode) {
        const playerState = room.players[socket.id];
        if (!playerState) return;
        playerState.action = action;
        const botRate = room.botDetails.games ? room.botDetails.betrayals / room.botDetails.games : 0.4;
        const botAction = Math.random() < botRate ? "betray" : "cooperate";
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
          net: Number((results.payout - 2).toFixed(2)),
          bonusPool: globalBonusPool
        });
        activeRooms.delete(roomId);
        console.log(`Match resolved Authoritatively: ${room.players[socket.id].details.name} (${action}) vs Bot ${room.botDetails.name} (${botAction})`);
      } else {
        const playerState = room.players[socket.id];
        if (!playerState) return;
        playerState.action = action;
        const otherSocketId = Object.keys(room.players).find((id) => id !== socket.id);
        if (!otherSocketId) return;
        const otherPlayerState = room.players[otherSocketId];
        if (otherPlayerState.action) {
          const results = resolveMatch(playerState.action, otherPlayerState.action);
          if (results.economy === "asymmetric") {
            globalBonusPool = Number((globalBonusPool + BONUS_POOL_CUT).toFixed(2));
          }
          room.status = "resolved";
          io.to(socket.id).emit("match-result", {
            playerAction: playerState.action,
            opponentAction: otherPlayerState.action,
            payout: results.payout,
            opponentPayout: results.opponentPayout,
            title: results.title,
            text: results.text,
            economy: results.economy,
            net: Number((results.payout - 2).toFixed(2)),
            bonusPool: globalBonusPool
          });
          const opponentResults = resolveMatch(otherPlayerState.action, playerState.action);
          io.to(otherSocketId).emit("match-result", {
            playerAction: otherPlayerState.action,
            opponentAction: playerState.action,
            payout: opponentResults.payout,
            opponentPayout: opponentResults.opponentPayout,
            title: opponentResults.title,
            text: opponentResults.text,
            economy: opponentResults.economy,
            net: Number((opponentResults.payout - 2).toFixed(2)),
            bonusPool: globalBonusPool
          });
          activeRooms.delete(roomId);
          console.log(`Match resolved Authoritatively: ${playerState.details.name} vs ${otherPlayerState.details.name}`);
        } else {
          socket.emit("waiting-for-opponent");
          io.to(otherSocketId).emit("opponent-submitted");
        }
      }
    });
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
      matchQueue = matchQueue.filter((q) => q.socket.id !== socket.id);
      for (const [roomId, room] of activeRooms.entries()) {
        if (room.players[socket.id]) {
          room.status = "cancelled";
          socket.to(roomId).emit("opponent-disconnected", {
            message: "\u0412\u0430\u0448 \u043E\u043F\u043F\u043E\u043D\u0435\u043D\u0442 \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u043B\u0441\u044F \u043E\u0442 \u0437\u0430\u0449\u0438\u0449\u0435\u043D\u043D\u043E\u0439 \u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0446\u0438\u0438."
          });
          activeRooms.delete(roomId);
        }
      }
    });
  });
  function resolveMatch(playerAction, opponentAction) {
    const COOPERATION_PAYOUT = 2.1;
    const SOLO_BETRAYAL_PAYOUT = 3.5;
    const DOUBLE_BETRAYAL_PAYOUT = 2;
    if (playerAction === "cooperate" && opponentAction === "cooperate") {
      return {
        payout: COOPERATION_PAYOUT,
        opponentPayout: COOPERATION_PAYOUT,
        title: "\u0412\u0437\u0430\u0438\u043C\u043D\u043E\u0435 \u0434\u043E\u0432\u0435\u0440\u0438\u0435",
        text: "\u0412\u044B \u043E\u0431\u0430 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u0447\u0430\u043B\u0438 \u0438 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u0438 \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u043F\u043B\u044E\u0441. \u0414\u043B\u044F \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B \u044D\u0442\u043E \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u043C\u0438\u043D\u0443\u0441.",
        economy: "coop"
      };
    }
    if (playerAction === "betray" && opponentAction === "cooperate") {
      return {
        payout: SOLO_BETRAYAL_PAYOUT,
        opponentPayout: 0,
        title: "\u0422\u044B \u043F\u0440\u0435\u0434\u0430\u043B \u043F\u0435\u0440\u0432\u044B\u043C",
        text: "\u0421\u043E\u043F\u0435\u0440\u043D\u0438\u043A \u0434\u043E\u0432\u0435\u0440\u0438\u043B\u0441\u044F, \u0442\u044B \u0437\u0430\u0431\u0440\u0430\u043B \u0432\u044B\u0438\u0433\u0440\u044B\u0448. \u0427\u0430\u0441\u0442\u044C \u0440\u0430\u0437\u043D\u0438\u0446\u044B \u0443\u0448\u043B\u0430 \u0432 \u0431\u043E\u043D\u0443\u0441\u043D\u044B\u0439 \u0444\u043E\u043D\u0434 \u041B\u0438\u0433\u0438 \u0434\u043E\u0432\u0435\u0440\u0438\u044F.",
        economy: "asymmetric"
      };
    }
    if (playerAction === "cooperate" && opponentAction === "betray") {
      return {
        payout: 0,
        opponentPayout: SOLO_BETRAYAL_PAYOUT,
        title: "\u0422\u0435\u0431\u044F \u043F\u0440\u0435\u0434\u0430\u043B\u0438",
        text: "\u0422\u044B \u0432\u044B\u0431\u0440\u0430\u043B \u0434\u043E\u0432\u0435\u0440\u0438\u0435, \u043D\u043E \u0441\u043E\u043F\u0435\u0440\u043D\u0438\u043A \u0437\u0430\u0431\u0440\u0430\u043B \u0432\u044B\u0438\u0433\u0440\u044B\u0448. \u0427\u0430\u0441\u0442\u044C \u0440\u0430\u0437\u043D\u0438\u0446\u044B \u0443\u0448\u043B\u0430 \u0432 \u0431\u043E\u043D\u0443\u0441\u043D\u044B\u0439 \u0444\u043E\u043D\u0434 \u041B\u0438\u0433\u0438 \u0434\u043E\u0432\u0435\u0440\u0438\u044F.",
        economy: "asymmetric"
      };
    }
    return {
      payout: DOUBLE_BETRAYAL_PAYOUT,
      opponentPayout: DOUBLE_BETRAYAL_PAYOUT,
      title: "\u0414\u0432\u043E\u0439\u043D\u043E\u0435 \u043F\u0440\u0435\u0434\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E",
      text: "\u041E\u0431\u0430 \u043D\u0435 \u0440\u0438\u0441\u043A\u043D\u0443\u043B\u0438 \u0434\u043E\u0432\u0435\u0440\u0438\u0442\u044C\u0441\u044F. \u0414\u0435\u043D\u044C\u0433\u0438 \u043F\u0440\u043E\u0441\u0442\u043E \u0432\u0435\u0440\u043D\u0443\u043B\u0438\u0441\u044C, \u0431\u043E\u043D\u0443\u0441\u043D\u044B\u0439 \u0444\u043E\u043D\u0434 \u043D\u0435 \u043F\u043E\u043F\u043E\u043B\u043D\u0438\u043B\u0441\u044F.",
      economy: "double_betrayal"
    };
  }
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Trust Duel Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
