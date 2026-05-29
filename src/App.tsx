import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { io, Socket } from "socket.io-client";
import {
  ShieldCheck,
  Skull,
  Eye,
  RefreshCw,
  Coins,
  Flame,
  History,
  Trophy,
  Lock,
  Users,
  AlertTriangle,
  UserX,
  Gift,
  Crown,
  CalendarDays,
  User,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Gamepad2,
  CreditCard,
  BookOpen,
  HelpCircle,
  Lightbulb,
  Search,
  Compass,
  Crosshair,
  Radio,
  Coffee,
  Heart,
} from "lucide-react";

interface Opponent {
  id: number;
  name: string;
  games: number;
  betrayals: number;
  avatar: string;
  style: string;
  profileHidden: boolean;
  isPlayer?: boolean;
  rate?: number;
  score?: number;
  eligible?: boolean;
}

interface LeagueMember {
  id: string | number;
  name: string;
  games: number;
  betrayals: number;
  avatar: string;
  style: string;
  profileHidden: boolean;
  isPlayer?: boolean;
  rate?: number;
  score?: number;
  eligible?: boolean;
}

interface HistoryRow {
  id: number;
  opponent: string;
  avatar: string;
  playerAction: "cooperate" | "betray";
  opponentAction: "cooperate" | "betray";
  payout: number;
  net: number;
  title: string;
  balance: number;
  economy: string;
  profileHiddenDuringRound: boolean;
}

interface LastResult {
  payout: number;
  opponentPayout: number;
  title: string;
  text: string;
  economy: string;
  playerAction: "cooperate" | "betray";
  opponentAction: "cooperate" | "betray";
  net: number;
}

const ENTRY_FEE = 2;
const REVEAL_FEE = 0.1;
const HIDE_FEE = 0.5;
const HIDE_DURATION = 5;

const COOPERATION_PAYOUT = 2.1;
const SOLO_BETRAYAL_PAYOUT = 3.5;
const DOUBLE_BETRAYAL_PAYOUT = 2;

const BONUS_POOL_CUT = 0.25;

const DEMO_SEEDED_GAMES = 10000;
const DEMO_ASYMMETRIC_RATE = 0.4;
const DEMO_SEEDED_BONUS_POOL = Number((DEMO_SEEDED_GAMES * DEMO_ASYMMETRIC_RATE * BONUS_POOL_CUT).toFixed(2));

const MIN_GAMES_FOR_WEEKLY_BONUS = 5;
const WEEKLY_BONUS_SHARES = [0.5, 0.3, 0.2];

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;

const initialOpponents: Opponent[] = [
  { id: 1, name: "QuietFox", games: 43, betrayals: 7, avatar: "🦊", style: "осторожный", profileHidden: false },
  { id: 2, name: "IronSmile", games: 88, betrayals: 61, avatar: "😈", style: "агрессивный", profileHidden: true },
  { id: 3, name: "MiraTrust", games: 27, betrayals: 2, avatar: "🕊️", style: "доверчивый", profileHidden: false },
  { id: 4, name: "ZeroLuck", games: 112, betrayals: 54, avatar: "🎲", style: "хаотичный", profileHidden: false },
  { id: 5, name: "BankerCat", games: 64, betrayals: 18, avatar: "🐈", style: "прагматичный", profileHidden: false },
  { id: 6, name: "RedWolf", games: 151, betrayals: 119, avatar: "🐺", style: "хищник", profileHidden: true },
  { id: 7, name: "SoftBee", games: 39, betrayals: 4, avatar: "🐝", style: "мирный", profileHidden: false },
  { id: 8, name: "NeonRaven", games: 74, betrayals: 33, avatar: "🦅", style: "непредсказуемый", profileHidden: true },
];

function betrayalRate(player: { games: number; betrayals: number }): number {
  if (!player.games) return 0;
  return Math.round((player.betrayals / player.games) * 100);
}

function weeklyEligible(player: { profileHidden: boolean; games: number }): boolean {
  return !player.profileHidden && player.games >= MIN_GAMES_FOR_WEEKLY_BONUS;
}

function trustScore(player: { games: number; betrayals: number; profileHidden: boolean }): number {
  const rate = betrayalRate(player);
  const volumeBonus = Math.min(player.games, 50) * 0.2;
  const hiddenPenalty = player.profileHidden ? 30 : 0;
  const lowVolumePenalty = player.games < MIN_GAMES_FOR_WEEKLY_BONUS ? 25 : 0;
  return Math.max(0, Math.min(100, Math.round(100 - rate + volumeBonus - hiddenPenalty - lowVolumePenalty)));
}

function riskLabel(rate: number) {
  if (rate <= 15) return { title: "низкий риск", hint: "скорее всего сотрудничает", tone: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" };
  if (rate <= 40) return { title: "умеренный риск", hint: "может играть честно", tone: "bg-blue-500/15 text-blue-700 border-blue-500/30" };
  if (rate <= 70) return { title: "высокий риск", hint: "часто предает", tone: "bg-amber-500/15 text-amber-800 border-amber-500/30" };
  return { title: "критический риск", hint: "почти наверняка предаст", tone: "bg-red-500/15 text-red-700 border-red-500/30" };
}

function getOpponentAction(opponent: Opponent): "cooperate" | "betray" {
  const rate = opponent.games ? opponent.betrayals / opponent.games : 0.5;
  return Math.random() < rate ? "betray" : "cooperate";
}

function resolveRound(playerAction: "cooperate" | "betray", opponentAction: "cooperate" | "betray") {
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

function pickOpponent(opponents: Opponent[], previousId: number | null): Opponent {
  const pool = opponents.filter((o) => o.id !== previousId);
  return pool[Math.floor(Math.random() * pool.length)] || opponents[0];
}

interface StatCardProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  sub?: string | null;
}

function StatCard({ icon: Icon, label, value, sub }: StatCardProps) {
  // Determine text colors based on the label for vibrant data density
  let valueColor = "text-slate-100";
  if (label === "Баланс") valueColor = "text-emerald-400";
  else if (label === "Твои игры") valueColor = "text-indigo-400";
  else if (label === "Предательства") valueColor = "text-red-400";
  else if (label === "Бонусный фонд") valueColor = "text-amber-400";
  else if (label === "Твой ранг") valueColor = "text-purple-400 animate-pulse";

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-800/40 p-3 shadow-lg backdrop-blur-md hover:border-indigo-500/20 transition-all duration-300 group flex flex-col justify-between min-w-0 overflow-hidden w-full h-full">
      {/* Icon & Label row */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <span className="text-[9px] xs:text-[10px] uppercase tracking-wider text-[#94a3b8] font-bold truncate block" title={label}>
          {label}
        </span>
        <div className="shrink-0 rounded-lg bg-slate-950 p-1.5 text-slate-400 flex items-center justify-center border border-white/5 shadow-inner">
          <Icon size={12} className="group-hover:text-indigo-400 transition-colors" />
        </div>
      </div>
      
      {/* Value row */}
      <div className="min-w-0">
        <div className={`text-sm xs:text-base sm:text-lg md:text-xl font-black font-mono leading-none tracking-tight truncate ${valueColor}`} title={String(value)}>
          {value}
        </div>
        {sub ? (
          <div className="text-[8px] xs:text-[9px] text-slate-400 font-medium tracking-wide mt-1 uppercase truncate" title={sub}>
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ActionButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "dark" | "green" | "red" | "light" | "amber" | "purple";
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

function ActionButton({ children, onClick, disabled, variant = "dark", icon: Icon }: ActionButtonProps) {
  const variants = {
    dark: "bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white border border-slate-700/80 shadow-md",
    green: "bg-emerald-600 text-white hover:bg-slate-950 hover:text-emerald-400 hover:border-emerald-500/30 border border-transparent shadow-lg shadow-emerald-950/25",
    red: "bg-red-600 text-white hover:bg-slate-950 hover:text-red-400 hover:border-red-500/30 border border-transparent shadow-lg shadow-red-950/25",
    light: "bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800 hover:border-slate-700",
    amber: "bg-amber-500 text-slate-950 hover:bg-amber-400 font-black shadow-lg shadow-amber-500/10",
    purple: "bg-indigo-600 text-white hover:bg-indigo-500 font-black shadow-lg shadow-indigo-600/10",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider shadow-sm transition-all duration-200 cursor-pointer active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 select-none ${variants[variant]}`}
    >
      {Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  );
}

export default function App() {
  const [balance, setBalance] = useState<number>(20);
  const [bonusPool, setBonusPool] = useState<number>(DEMO_SEEDED_BONUS_POOL);
  const [playerGames, setPlayerGames] = useState<number>(0);
  const [playerBetrayals, setPlayerBetrayals] = useState<number>(0);
  const [playerProfileHidden, setPlayerProfileHidden] = useState<boolean>(false);
  const [hiddenRoundsLeft, setHiddenRoundsLeft] = useState<number>(0);
  const [weeklyBonusClaimed, setWeeklyBonusClaimed] = useState<boolean>(false);
  const [opponents, setOpponents] = useState<Opponent[]>(initialOpponents);
  const [currentOpponentId, setCurrentOpponentId] = useState<number>(() => pickOpponent(initialOpponents, null).id);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [showResultPopup, setShowResultPopup] = useState<boolean>(false);
  const [showTipPopup, setShowTipPopup] = useState<boolean>(false);
  const [showDonatePopup, setShowDonatePopup] = useState<boolean>(false);
  const [copiedCard, setCopiedCard] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("Найден соперник. Можно играть вслепую или открыть досье за $0.10.");

  // Telegram integration hooks
  const [tgUser, setTgUser] = useState<{ first_name: string; username?: string; id?: number } | null>(null);
  const [isTelegram, setIsTelegram] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(true);
  const [authProgress, setAuthProgress] = useState<number>(0);
  const [authStatusText, setAuthStatusText] = useState<string>("Запуск защищенного защитного шлюза...");

  // Navigation & Interactive Pages State
  const [activeTab, setActiveTab] = useState<"account" | "history" | "play" | "finance" | "rules">("rules");
  const [financeSubTab, setFinanceSubTab] = useState<"deposit" | "withdraw">("deposit");
  const [depositAmount, setDepositAmount] = useState<number>(25);
  const [customDeposit, setCustomDeposit] = useState<string>("");
  const [isDepositing, setIsDepositing] = useState<boolean>(false);
  const [depositMethod, setDepositMethod] = useState<"stars" | "card" | "crypto">("crypto");
  const [depositStatus, setDepositStatus] = useState<string>("");

  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [withdrawMethod, setWithdrawMethod] = useState<"trc20" | "stars" | "card">("trc20");
  const [withdrawAddress, setWithdrawAddress] = useState<string>("");
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [withdrawStep, setWithdrawStep] = useState<number>(0);
  const [withdrawLogs, setWithdrawLogs] = useState<string[]>([]);
  const [withdrawStatus, setWithdrawStatus] = useState<string>("");

  // Multi-user WebSocket & Matchmaker States
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);
  const [isClientSideBotMatch, setIsClientSideBotMatch] = useState<boolean>(false);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchDuration, setSearchDuration] = useState<number>(0);
  const [activeMatch, setActiveMatch] = useState<{
    roomId: string;
    opponent: {
      id: string;
      name: string;
      games: number;
      betrayals: number;
      avatar: string;
      style: string;
      profileHidden: boolean;
      balance: number;
    };
    yourRole: string;
  } | null>(null);
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState<boolean>(false);
  const [opponentSubmitted, setOpponentSubmitted] = useState<boolean>(false);
  const [matchResultState, setMatchResultState] = useState<{
    playerAction: "cooperate" | "betray";
    opponentAction: "cooperate" | "betray";
    payout: number;
    opponentPayout: number;
    title: string;
    text: string;
    economy: string;
    net: number;
  } | null>(null);

  const activeMatchRef = React.useRef(activeMatch);
  React.useEffect(() => {
    activeMatchRef.current = activeMatch;
  }, [activeMatch]);

  const balanceRef = React.useRef(balance);
  React.useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  const playerProfileHiddenRef = React.useRef(playerProfileHidden);
  React.useEffect(() => {
    playerProfileHiddenRef.current = playerProfileHidden;
  }, [playerProfileHidden]);

  React.useEffect(() => {
    // Connect to the unified backend server.
    // If running on custom domain (like trust-duel.vercel.app), connect to persistent Cloud Run URL.
    // Otherwise, connect to current host origin (e.g. localhost or direct Cloud Run sandbox url).
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const isCloudRun = window.location.hostname.includes("europe-west2.run.app");
    
    const socketServerUrl = (isLocalhost || isCloudRun) 
      ? undefined 
      : "https://ais-pre-vjhe7nt56td4wo5e5xdszz-730156147031.europe-west2.run.app";

    console.log("Connecting WebSocket to domain:", socketServerUrl || "current host");

    const s = io(socketServerUrl, {
      transports: ["websocket"],
      upgrade: false,
      reconnectionAttempts: 15,
      timeout: 12000
    });
    setSocket(s);

    s.on("connect", () => {
      console.log("WebSocket connected successfully:", s.id);
      setIsSocketConnected(true);
    });

    s.on("connect_error", (error) => {
      console.error("WebSocket connection error:", error);
      setIsSocketConnected(false);
    });

    s.on("disconnect", (reason) => {
      console.warn("WebSocket disconnected:", reason);
      setIsSocketConnected(false);
    });

    s.on("server-stats", (data: { onlineCount: number; queueCount?: number; bonusPool: number }) => {
      if (data.onlineCount) setOnlineCount(data.onlineCount);
      if (typeof data.queueCount === "number") setQueueCount(data.queueCount);
      if (data.bonusPool) setBonusPool(data.bonusPool);
    });

    s.on("match-found", (data: any) => {
      triggerHaptic("success");
      setIsSearching(false);
      setActiveMatch(data);
      setOpponentSubmitted(false);
      setIsWaitingForOpponent(false);
      setMatchResultState(null);
      setMessage(`Соперник ${data.opponent.name} успешно обнаружен. Начинаем защищенный Trust Duel!`);
    });

    s.on("opponent-submitted", () => {
      triggerHaptic("light");
      setOpponentSubmitted(true);
    });

    s.on("waiting-for-opponent", () => {
      setIsWaitingForOpponent(true);
    });

    s.on("match-result", (data: any) => {
      triggerHaptic("medium");
      setIsWaitingForOpponent(false);
      setMatchResultState(data);
      if (data.bonusPool) setBonusPool(data.bonusPool);
      
      // Update local bankroll and stats cleanly
      setBalance((v) => Number((v - ENTRY_FEE + data.payout).toFixed(2)));
      setPlayerGames((v) => v + 1);
      if (data.playerAction === "betray") {
        setPlayerBetrayals((v) => v + 1);
      }

      const oppName = activeMatchRef.current?.opponent.name || "Соперник";
      const oppAvatar = activeMatchRef.current?.opponent.avatar || "👤";

      // Add a record to history
      const row: HistoryRow = {
        id: Date.now(),
        // Check if opponent action is betray
        opponent: data.opponentAction === "betray" ? `[Duel] ${oppName} (ПРЕДАТЕЛЬ)` : `[Duel] ${oppName} (ДОВЕРИЕ)`,
        avatar: oppAvatar,
        playerAction: data.playerAction,
        opponentAction: data.opponentAction,
        payout: data.payout,
        net: data.net,
        title: data.title,
        balance: Number((balanceRef.current - ENTRY_FEE + data.payout).toFixed(2)),
        economy: data.economy,
        profileHiddenDuringRound: playerProfileHiddenRef.current,
      };

      setHistory((prev) => [row, ...prev].slice(0, 10));
      setMessage(`Дуэль завершена: ${data.title}. ${data.text}`);
    });

    s.on("opponent-disconnected", (data: { message: string }) => {
      triggerHaptic("warning");
      setMessage(data.message);
      setIsWaitingForOpponent(false);
      setOpponentSubmitted(false);
      setActiveMatch(null);
      setIsSearching(false);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSearching) {
      setSearchDuration(0);
      interval = setInterval(() => {
        setSearchDuration((d) => {
          const next = d + 1;
          if (next >= 15) {
            // Automatically launch bot fallback match if search exceeds 15 seconds
            setTimeout(() => {
              forceBotMatch();
            }, 50);
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSearching]);

  const startMatchmaking = () => {
    if (balance < ENTRY_FEE) {
      triggerHaptic("error");
      setMessage("Недостаточно средств на балансе для внесения залога.");
      return;
    }
    triggerHaptic("medium");
    setIsSearching(true);
    setMatchResultState(null);
    setOpponentSubmitted(false);
    setIsWaitingForOpponent(false);
    setIsClientSideBotMatch(false);
    
    if (socket && isSocketConnected) {
      const rate = playerGames ? Math.round((playerBetrayals / playerGames) * 100) : 0;
      // Register details in matchmaking queue in real-time server
      socket.emit("join-queue", {
        name: tgUser ? (tgUser.username ? `@${tgUser.username}` : tgUser.first_name) : `Игрок_${socket.id?.substring(0, 4) || "You"}`,
        games: playerGames,
        betrayals: playerBetrayals,
        avatar: tgUser ? "📱" : "👤",
        style: rate > 60 ? "агрессивный" : rate < 20 ? "осторожный" : "хаотичный",
        profileHidden: playerProfileHidden,
        balance: balance
      });
      setMessage("Поиск оппонента в защищенном пуле Лиги Доверия...");
    } else {
      setMessage("Локальный поиск оппонента в Лиге Доверия...");
    }
  };

  const cancelMatchmaking = () => {
    triggerHaptic("light");
    if (socket && isSocketConnected) {
      socket.emit("leave-queue");
    }
    setIsSearching(false);
    setMessage("Поиск оппонента отменен.");
  };

  const submitMatchAction = (action: "cooperate" | "betray") => {
    if (!activeMatch) return;
    triggerHaptic("medium");

    if (isClientSideBotMatch) {
      setIsWaitingForOpponent(true);
      setMessage("Твой выбор зафиксирован. Ожидаем решения ИИ-оппонента...");
      
      // Simulate Bot Decision with realistic latency of 1200ms
      setTimeout(() => {
        const oppName = activeMatch.opponent.name;
        const oppAvatar = activeMatch.opponent.avatar;
        
        // Decide bot action based on betray rate
        const rate = activeMatch.opponent.games ? activeMatch.opponent.betrayals / activeMatch.opponent.games : 0.5;
        const opponentAction = Math.random() < rate ? "betray" : "cooperate";
        
        const result = resolveRound(action, opponentAction);
        
        // Update local balance and stats
        setBalance((v) => Number((v - ENTRY_FEE + result.payout).toFixed(2)));
        setPlayerGames((v) => v + 1);
        if (action === "betray") {
          setPlayerBetrayals((v) => v + 1);
        }

        // Keep local opponent database updated too
        setOpponents((prev) =>
          prev.map((o) =>
            o.name === oppName
              ? {
                  ...o,
                  games: o.games + 1,
                  betrayals: o.betrayals + (opponentAction === "betray" ? 1 : 0),
                }
              : o
          )
        );

        const newBalance = Number((balanceRef.current - ENTRY_FEE + result.payout).toFixed(2));

        const row: HistoryRow = {
          id: Date.now(),
          opponent: opponentAction === "betray" ? `[Duel] ${oppName} (ПРЕДАТЕЛЬ)` : `[Duel] ${oppName} (ДОВЕРИЕ)`,
          avatar: oppAvatar,
          playerAction: action,
          opponentAction: opponentAction,
          payout: result.payout,
          net: Number((result.payout - ENTRY_FEE).toFixed(2)),
          title: result.title,
          balance: newBalance,
          economy: result.economy,
          profileHiddenDuringRound: playerProfileHiddenRef.current,
        };

        setHistory((prev) => [row, ...prev].slice(0, 10));

        setMatchResultState({
          playerAction: action,
          opponentAction: opponentAction,
          payout: result.payout,
          opponentPayout: result.opponentPayout,
          title: result.title,
          text: result.text,
          economy: result.economy,
          net: row.net
        });

        setIsWaitingForOpponent(false);
        triggerHaptic("medium");
        setMessage(`Локальная дуэль завершена: ${result.title}. ${result.text}`);
      }, 1200);
      return;
    }

    if (socket && isSocketConnected) {
      socket.emit("submit-action", {
        roomId: activeMatch.roomId,
        action
      });
      setMessage("Твой выбор зафиксирован. Ожидаем решения оппонента...");
    }
  };

  const completeMatch = () => {
    triggerHaptic("light");
    setActiveMatch(null);
    setMatchResultState(null);
    setOpponentSubmitted(false);
    setIsWaitingForOpponent(false);
    setIsClientSideBotMatch(false);
    setMessage("Вы вернулись в лобби дуэлей. Готовы к следующему поиску?");
  };

  const searchAnotherOpponent = () => {
    triggerHaptic("medium");
    if (activeMatch && socket && isSocketConnected && !isClientSideBotMatch) {
      socket.emit("leave-room", { roomId: activeMatch.roomId });
    }
    setActiveMatch(null);
    setMatchResultState(null);
    setOpponentSubmitted(false);
    setIsWaitingForOpponent(false);
    setIsClientSideBotMatch(false);
    
    // Now trigger matchmaking immediately
    setIsSearching(true);
    setSearchDuration(0);

    if (socket && isSocketConnected) {
      const rate = playerGames ? Math.round((playerBetrayals / playerGames) * 100) : 0;
      socket.emit("join-queue", {
        name: tgUser ? (tgUser.username ? `@${tgUser.username}` : tgUser.first_name) : `Игрок_${socket.id?.substring(0, 4) || "You"}`,
        games: playerGames,
        betrayals: playerBetrayals,
        avatar: tgUser ? "📱" : "👤",
        style: rate > 60 ? "агрессивный" : rate < 20 ? "осторожный" : "хаотичный",
        profileHidden: playerProfileHidden,
        balance: balance
      });
      setMessage("Поиск нового оппонента в защищенном пуле Лиги Доверия...");
    } else {
      setMessage("Локальный поиск оппонента в Лиге Доверия...");
    }
  };

  const forceBotMatch = () => {
    // Elegant client-side fallback if socket is disconnected/not yet ready
    if (!socket || !isSocketConnected) {
      triggerHaptic("medium");
      setIsClientSideBotMatch(true);
      setIsSearching(false);

      const bots = [
        { name: "QuietFox", games: 43, betrayals: 7, avatar: "🦊", style: "осторожный", profileHidden: false, rate: 16 },
        { name: "IronSmile", games: 88, betrayals: 61, avatar: "😈", style: "агрессивный", profileHidden: true, rate: 69 },
        { name: "MiraTrust", games: 27, betrayals: 2, avatar: "🕊️", style: "доверчивый", profileHidden: false, rate: 7 },
        { name: "ZeroLuck", games: 112, betrayals: 54, avatar: "🎲", style: "хаотичный", profileHidden: false, rate: 48 },
        { name: "BankerCat", games: 64, betrayals: 18, avatar: "🐈", style: "прагматичный", profileHidden: false, rate: 28 },
        { name: "RedWolf", games: 151, betrayals: 119, avatar: "🐺", style: "хищник", profileHidden: true, rate: 79 },
      ];
      const bot = bots[Math.floor(Math.random() * bots.length)];

      setActiveMatch({
        roomId: `local_bot_${Date.now()}`,
        opponent: {
          id: `local_bot`,
          name: bot.name,
          games: bot.games,
          betrayals: bot.betrayals,
          avatar: bot.avatar,
          style: bot.style,
          profileHidden: bot.profileHidden,
          balance: 20
        },
        yourRole: "player1"
      });
      setOpponentSubmitted(false);
      setIsWaitingForOpponent(false);
      setMatchResultState(null);
      setMessage("Запущен офлайн-матч с ИИ-ботом Лиги доверия!");
      return;
    }

    triggerHaptic("medium");
    const rate = playerGames ? Math.round((playerBetrayals / playerGames) * 100) : 0;
    socket.emit("force-bot-match", {
      name: tgUser ? (tgUser.username ? `@${tgUser.username}` : tgUser.first_name) : `Игрок_${socket.id?.substring(0, 4) || "You"}`,
      games: playerGames,
      betrayals: playerBetrayals,
      avatar: tgUser ? "📱" : "👤",
      style: rate > 60 ? "агрессивный" : rate < 20 ? "осторожный" : "хаотичный",
      profileHidden: playerProfileHidden,
      balance: balance
    });
    setMessage("Запуск симулированного бота для тестирования...");
  };

  // Динамические советы дня во вкладку "Правила"
  const tipOfDay = useMemo(() => {
    if (playerGames === 0) {
      return {
        label: "Стартовая стратегия",
        text: "Вы ещё не провели ни одной дуэли. Рекомендуем начать с аккуратного «Сотрудничества» (🤝). Это заложит прочный фундамент высокой репутации, позволит войти в топ Лиги доверия и сразу зарекомендовать себя надёжным партнёром.",
        rec: "Репутация строится с самого первого хода!",
        theme: "border-indigo-500/20 bg-indigo-500/5 text-indigo-300",
        badge: "Новичок",
        icon: HelpCircle,
      };
    }

    const rate = Math.round((playerBetrayals / playerGames) * 100);

    if (rate <= 15) {
      return {
        label: "Благородный стратег",
        text: `Ваш процент предательств превосходен — всего ${rate}%. Вы олицетворяете высший уровень честности! Однако не забывайте проверять досье соперников перед ходом, особенно если их стиль указан как «хищный» или «агрессивный», чтобы не стать жертвой коварного удара.`,
        rec: "Минимизируйте риски: используйте проверку досье и скрытие.",
        theme: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
        badge: "Мудрец",
        icon: ShieldCheck,
      };
    }
    if (rate <= 40) {
      return {
        label: "Рациональный прагматик",
        text: `Показатель предательств составляет умеренные ${rate}%. Вы успешно балансируете между личной выгодой и доверием. Чтобы претендовать на весомую часть еженедельного бонусного фонда, старайтесь чаще сотрудничать, стимулируя встречную лояльность в последующих играх.`,
        rec: "Сотрудничество окупается на длинных дистанциях.",
        theme: "border-indigo-500/20 bg-indigo-500/5 text-indigo-300",
        badge: "Прагматик",
        icon: Users,
      };
    }
    if (rate <= 70) {
      return {
        label: "Опасная зона доверия",
        text: `У вас повышенный уровень предательств (${rate}%). Оппоненты видят эту статистику при проверке вашего досье и с высокой вероятностью будут предавать вас превентивно. Попробуйте провести серию из 3-5 раундов исключительно сотрудничая — это очистит вашу историю и вернет доверие соперников.`,
        rec: "Снизьте темп предательств, чтобы разблокировать общую выгоду.",
        theme: "border-amber-500/20 bg-amber-500/5 text-amber-300",
        badge: "Оппортунист",
        icon: AlertTriangle,
      };
    }
    return {
      label: "Режим Хищника",
      text: `Статистика предательств критически высока (${rate}%). Соперники видят в вас прямую угрозу и будут отвечать только предательством, обрекая игры на взаимное обнуление прибыли. Срочно используйте опцию «Шифрования» (🛡️) для сокрытия досье и перестройте стиль игры в пользу мира.`,
      rec: "Скройте досье щитом на 5 раундов и начните честно.",
      theme: "border-red-500/20 bg-red-500/5 text-red-400",
      badge: "Агрессор",
      icon: Skull,
    };
  }, [playerGames, playerBetrayals]);

  React.useEffect(() => {
    const webApp = (window as any).Telegram?.WebApp;
    if (webApp) {
      try {
        webApp.ready();
        webApp.expand();
        setIsTelegram(true);
        if (webApp.initDataUnsafe?.user) {
          setTgUser(webApp.initDataUnsafe.user);
        }
      } catch (e) {
        console.error("Telegram WebApp initialization error", e);
      }
    }

    // Имитация мгновенного безопасного подключения и расшифровки WebApp данных
    const interval = setInterval(() => {
      setAuthProgress((prev) => {
        const next = prev + Math.floor(Math.random() * 15) + 10;
        if (next >= 100) {
          clearInterval(interval);
          return 100;
        }
        return next;
      });
    }, 120);

    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (authProgress < 20) {
      setAuthStatusText("Инициализация контейнера WebApp...");
    } else if (authProgress < 45) {
      setAuthStatusText("Запрос HMAC цифровой подписи Telegram...");
    } else if (authProgress < 75) {
      setAuthStatusText(tgUser ? `Декодирование сессии @${tgUser.username || tgUser.first_name}...` : "Автоматический вход по протоколу...");
    } else if (authProgress < 95) {
      setAuthStatusText("Синхронизация профиля в Лиге Доверия...");
    } else {
      setAuthStatusText("Авторизация успешно завершена!");
    }

    if (authProgress === 100) {
      const timer = setTimeout(() => {
        setIsAuthenticating(false);
        triggerHaptic('success');
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [authProgress, tgUser]);

  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') => {
    const webApp = (window as any).Telegram?.WebApp;
    if (webApp && webApp.HapticFeedback) {
      try {
        if (['light', 'medium', 'heavy'].includes(type)) {
          webApp.HapticFeedback.impactOccurred(type as 'light' | 'medium' | 'heavy');
        } else {
          webApp.HapticFeedback.notificationOccurred(type as 'success' | 'warning' | 'error');
        }
      } catch (err) {
        console.warn("Haptic trigger error", err);
      }
    }
  };

  // Вычисляем текущего оппонента на основе актуального массива opponents
  const currentOpponent = useMemo(() => {
    return opponents.find((o) => o.id === currentOpponentId) || opponents[0];
  }, [opponents, currentOpponentId]);

  const opponentRate = betrayalRate(currentOpponent);
  const risk = riskLabel(opponentRate);
  const isRevealed = revealedIds.has(currentOpponent.id);
  const playerRate = playerGames ? Math.round((playerBetrayals / playerGames) * 100) : 0;
  const canPlay = balance >= ENTRY_FEE;
  const canReveal = balance >= REVEAL_FEE && !isRevealed;
  const canHideProfile = balance >= HIDE_FEE && !playerProfileHidden;

  const playerLeagueProfile = useMemo<LeagueMember>(
    () => ({
      id: "me",
      name: tgUser ? (tgUser.username ? `@${tgUser.username}` : tgUser.first_name) : "Ты",
      games: playerGames,
      betrayals: playerBetrayals,
      avatar: tgUser ? "📱" : "🧑‍🚀",
      style: isTelegram ? "Telegram Игрок" : "живой игрок",
      profileHidden: playerProfileHidden,
      isPlayer: true,
    }),
    [playerGames, playerBetrayals, playerProfileHidden, tgUser, isTelegram]
  );

  const weeklyLeague = useMemo<LeagueMember[]>(() => {
    const list: LeagueMember[] = [playerLeagueProfile, ...opponents];
    return list
      .map((player) => ({
        ...player,
        rate: betrayalRate(player),
        score: trustScore(player),
        eligible: weeklyEligible(player),
      }))
      .sort((a, b) => {
        const aEligible = a.eligible || false;
        const bEligible = b.eligible || false;
        if (aEligible && !bEligible) return -1;
        if (!aEligible && bEligible) return 1;
        
        const aScore = a.score || 0;
        const bScore = b.score || 0;
        if (bScore !== aScore) return bScore - aScore;
        
        const aRate = a.rate || 0;
        const bRate = b.rate || 0;
        return aRate - bRate;
      });
  }, [opponents, playerLeagueProfile]);

  const topThreeWeekly = weeklyLeague.filter((p) => p.eligible).slice(0, 3);
  const playerWeeklyRank = weeklyLeague.findIndex((p) => p.isPlayer) + 1;
  const playerTopIndex = topThreeWeekly.findIndex((p) => p.isPlayer);
  const playerWeeklyBonus = playerTopIndex >= 0 ? Number((bonusPool * WEEKLY_BONUS_SHARES[playerTopIndex]).toFixed(2)) : 0;
  const canClaimWeeklyBonus = playerWeeklyBonus > 0 && !weeklyBonusClaimed;
  const leaderboard = weeklyLeague.slice(0, 5);

  const findNewOpponent = () => {
    triggerHaptic('light');
    const next = pickOpponent(opponents, currentOpponentId);
    setCurrentOpponentId(next.id);
    setLastResult(null);
    setShowResultPopup(false);
    setMessage("Новый соперник найден. Решай: доверять вслепую или купить досье.");
  };

  const revealProfile = () => {
    if (!canReveal) {
      triggerHaptic('error');
      return;
    }
    triggerHaptic('light');
    setBalance((v) => Number((v - REVEAL_FEE).toFixed(2)));
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.add(currentOpponent.id);
      return next;
    });

    if (currentOpponent.profileHidden) {
      setMessage(`${currentOpponent.name} скрыл досье. Детальная статистика недоступна, но сам факт скрытия — сильный сигнал риска.`);
      return;
    }

    setMessage(`Досье открыто: у ${currentOpponent.name} ${opponentRate}% предательств.`);
  };

  const hideMyProfile = () => {
    if (!canHideProfile) {
      triggerHaptic('error');
      return;
    }
    triggerHaptic('medium');
    setBalance((v) => Number((v - HIDE_FEE).toFixed(2)));
    setPlayerProfileHidden(true);
    setHiddenRoundsLeft(HIDE_DURATION);
    setMessage(`Ты скрыл своё досье за ${fmt(HIDE_FEE)}. Пока досье скрыто, ты не можешь получить еженедельный бонус доверия.`);
  };

  const claimWeeklyBonus = () => {
    if (!canClaimWeeklyBonus) {
      triggerHaptic('error');
      return;
    }
    triggerHaptic('success');
    setBalance((v) => Number((v + playerWeeklyBonus).toFixed(2)));
    setBonusPool((v) => Number(Math.max(0, v - playerWeeklyBonus).toFixed(2)));
    setWeeklyBonusClaimed(true);
    setMessage(`Еженедельный бонус получен: +${fmt(playerWeeklyBonus)} за место #${playerWeeklyRank} в Лиге доверия.`);
  };

  const playRound = (playerAction: "cooperate" | "betray") => {
    if (!canPlay) {
      triggerHaptic('warning');
      setMessage("Недостаточно средств для входного билета.");
      return;
    }

    const opponentAction = getOpponentAction(currentOpponent);
    const result = resolveRound(playerAction, opponentAction);
    const newBalance = Number((balance - ENTRY_FEE + result.payout).toFixed(2));

    // Custom tactical haptic impact based on player play and opponent result
    if (playerAction === "betray" && opponentAction === "betray") {
      triggerHaptic('heavy');
    } else if (playerAction === "betray" || opponentAction === "betray") {
      triggerHaptic('medium');
    } else {
      triggerHaptic('success');
    }

    if (result.economy === "asymmetric") {
      setBonusPool((v) => Number((v + BONUS_POOL_CUT).toFixed(2)));
    }

    const nextHiddenRounds = playerProfileHidden ? Math.max(hiddenRoundsLeft - 1, 0) : 0;
    const profileJustOpened = playerProfileHidden && nextHiddenRounds === 0;

    setBalance(newBalance);
    setPlayerGames((v) => v + 1);
    if (playerAction === "betray") setPlayerBetrayals((v) => v + 1);

    if (playerProfileHidden) {
      setHiddenRoundsLeft(nextHiddenRounds);
      if (nextHiddenRounds === 0) setPlayerProfileHidden(false);
    }

    setOpponents((prev) =>
      prev.map((o) =>
        o.id === currentOpponent.id
          ? {
              ...o,
              games: o.games + 1,
              betrayals: o.betrayals + (opponentAction === "betray" ? 1 : 0),
            }
          : o
      )
    );

    const row: HistoryRow = {
      id: Date.now(),
      opponent: currentOpponent.name,
      avatar: currentOpponent.avatar,
      playerAction,
      opponentAction,
      payout: result.payout,
      net: Number((result.payout - ENTRY_FEE).toFixed(2)),
      title: result.title,
      balance: newBalance,
      economy: result.economy,
      profileHiddenDuringRound: playerProfileHidden,
    };

    setHistory((prev) => [row, ...prev].slice(0, 10));
    setLastResult({ ...result, playerAction, opponentAction, net: row.net });
    setShowResultPopup(true);
    setMessage(profileJustOpened ? `${result.text} Срок скрытия твоего досье закончился.` : result.text);
  };

  const resetGame = () => {
    triggerHaptic('warning');
    setBalance(20);
    setBonusPool(DEMO_SEEDED_BONUS_POOL);
    setPlayerGames(0);
    setPlayerBetrayals(0);
    setPlayerProfileHidden(false);
    setHiddenRoundsLeft(0);
    setWeeklyBonusClaimed(false);
    setOpponents(initialOpponents);
    setCurrentOpponentId(pickOpponent(initialOpponents, null).id);
    setRevealedIds(new Set());
    setHistory([]);
    setLastResult(null);
    setShowResultPopup(false);
    setMessage("Игра сброшена. Баланс снова $20.00.");
  };

  const actionText = (action: "cooperate" | "betray") => (action === "betray" ? "предал" : "сотрудничал");

  const handleDeposit = () => {
    const finalAmount = customDeposit ? parseFloat(customDeposit) : depositAmount;
    if (isNaN(finalAmount) || finalAmount <= 0) {
      triggerHaptic('error');
      setDepositStatus("Введите корректную сумму");
      return;
    }

    triggerHaptic('light');
    setIsDepositing(true);
    setDepositStatus("Инициализация платежной сессии...");

    setTimeout(() => {
      setDepositStatus("Подключение к защищенному шлюзу...");
      triggerHaptic('medium');
      setTimeout(() => {
        setDepositStatus(`Ожидание подтверждения транзакции на сумму $${finalAmount.toFixed(2)}...`);
        setTimeout(() => {
          setBalance(prev => Number((prev + finalAmount).toFixed(2)));
          setIsDepositing(false);
          setCustomDeposit("");
          setDepositStatus(`Успешно начислено $${finalAmount.toFixed(2)}!`);
          triggerHaptic('success');
          setMessage(`Баланс успешно пополнен: +${fmt(finalAmount)}. Прекрасно!`);
          setTimeout(() => setDepositStatus(""), 4000);
        }, 1200);
      }, 1000);
    }, 800);
  };

  const handleWithdraw = () => {
    const finalAmount = parseFloat(withdrawAmount);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      triggerHaptic('error');
      setWithdrawStatus("Введите корректную сумму для вывода");
      return;
    }
    if (finalAmount > balance) {
      triggerHaptic('error');
      setWithdrawStatus("Недостаточно средств на балансе");
      return;
    }
    if (!withdrawAddress.trim()) {
      triggerHaptic('error');
      setWithdrawStatus("Введите адрес кошелька или номер карты");
      return;
    }

    triggerHaptic('light');
    setIsWithdrawing(true);
    setWithdrawStep(1);
    setWithdrawLogs(["[SYS] Инициализация запроса на вывод..."]);
    setWithdrawStatus("");
    
    setTimeout(() => {
      setWithdrawStep(2);
      setWithdrawLogs(prev => [...prev, "[OK] Проверка резервов ликвидности смарт-контракта...", "[SYS] Сопряжение с адресом получателя..."]);
      triggerHaptic('medium');
      setTimeout(() => {
        setWithdrawStep(3);
        setWithdrawLogs(prev => [...prev, `[OK] Средства заразервированы: ${fmt(finalAmount)}`, "[SYS] Одобрение мультиподписи валидаторами..."]);
        setTimeout(() => {
          setWithdrawStep(4);
          setWithdrawLogs(prev => [...prev, "[OK] Цифровая подпись сформирована!", "[SYS] Трансляция в блокчейн-сеть..."]);
          setTimeout(() => {
            setBalance(prev => Number((prev - finalAmount).toFixed(2)));
            setIsWithdrawing(false);
            setWithdrawStep(5);
            setWithdrawAmount("");
            setWithdrawLogs(prev => [
              ...prev,
              `[SUCCESS] Транзакция выполнена! Демо-средства отправлены по адресу: ${withdrawAddress}`,
              `[INFO] Хэш транзакции: TX_DUEL_${Math.random().toString(36).substring(2, 9).toUpperCase()}`
            ]);
            triggerHaptic('success');
            setMessage(`Запрос на вывод зарегистрирован! Списано: ${fmt(finalAmount)}.`);
            setTimeout(() => {
              setWithdrawStep(0);
              setWithdrawLogs([]);
            }, 6000);
          }, 1500);
        }, 1200);
      }, 1000);
    }, 800);
  };

  if (isAuthenticating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white font-sans">
        <div className="text-center px-4 max-w-sm">
          {/* Animated lock or keyhole icon */}
          <div className="mx-auto w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-6 animate-pulse">
            <Lock size={32} />
          </div>
          <h2 className="text-lg font-black tracking-wider uppercase text-white animate-pulse">
            Вход в систему...
          </h2>
          <div className="mt-4 w-full bg-slate-900 border border-slate-800 h-2 rounded-full overflow-hidden">
            <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${authProgress}%` }}></div>
          </div>
          <p className="mt-3 text-[11px] text-slate-400 font-mono tracking-tight leading-relaxed">
            {authStatusText}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="app-root" className="min-h-screen bg-slate-950 text-white font-sans antialiased overflow-y-auto selection:bg-indigo-500/30">
      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center rounded-2xl bg-slate-800/50 border border-white/10 p-5 backdrop-blur shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-lg border border-indigo-400/30 select-none">
              TD
            </div>
            <div>
              <div className="mb-1">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/40 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] shadow-sm select-none">
                  <Flame size={12} className="text-amber-400" /> Prisoner's Dilemma
                </span>
              </div>
              <h1 className="text-2xl font-black tracking-tighter uppercase text-white md:text-3xl leading-none">
                Trust Duel <span className="text-indigo-400 font-extrabold text-[#6366f1] text-base font-mono tracking-tight ml-1">v2.0</span>
              </h1>
            </div>
          </div>
        </header>

        {/* Global Statistics Grid */}
        {activeTab === "account" && (
          <div className="mb-6 grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            <StatCard icon={Coins} label="Баланс" value={fmt(balance)} sub="демо-счёт" />
            <StatCard icon={Users} label="Твои игры" value={playerGames} sub="сыгранные раунды" />
            <StatCard icon={Skull} label="Предательства" value={`${playerRate}%`} sub={`${playerBetrayals} из ${playerGames || 0}`} />
            <StatCard icon={Gift} label="Бонусный фонд" value={fmt(bonusPool)} sub="Бонус-фонд" />
            <StatCard icon={Trophy} label="Твой ранг" value={`#${playerWeeklyRank}`} sub="Лига доверия" />
          </div>
        )}

        {/* Workspace Layout */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="pb-24"
          >
            {activeTab === "play" && (
              <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
                {/* LOBBY / PRE-MATCH SEARCH STATE */}
                {!isSearching && !activeMatch && (
                  <section className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-2xl backdrop-blur-md md:p-8 relative overflow-hidden text-center">
                    <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
                    
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 animate-bounce">
                      <Gamepad2 size={32} />
                    </div>

                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Терминал Дуэлей Trust Duel</h2>
                    
                    {/* Visual Connection State Indicator */}
                    <div className="mt-2 flex flex-col items-center justify-center gap-1.5 select-none">
                      <div className="flex items-center justify-center">
                        {isSocketConnected && socket ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 px-3 py-0.5 text-[10px] font-black font-mono tracking-widest text-indigo-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            СЕТЬ: АКТИВНА (ID: {socket.id?.substring(0, 6)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 px-3 py-0.5 text-[10px] font-black font-mono tracking-widest text-rose-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
                            ПОИСК СЕТЕВОГО УЗЛА...
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] font-semibold text-slate-500 tracking-tight leading-none text-center">
                        * Важно: Все ваши друзья должны использовать одну ссылку ({window.location.hostname.includes("ais-pre") ? "SHARE" : "DEV"}).
                      </span>
                    </div>

                    <p className="mt-3.5 max-w-md mx-auto text-xs text-slate-400 leading-relaxed">
                      Случайные дуэли в защищенном пуле Лиги Доверия. Оппоненты подбираются из активных участников в реальном времени.
                    </p>

                    {/* Stats Dashboard inside Lobby */}
                    <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto my-6">
                      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-4">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Игроков онлайн</div>
                        <div className="text-xl font-black text-indigo-400 font-mono mt-0.5">{onlineCount}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-4">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Входной залог</div>
                        <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">{fmt(ENTRY_FEE)}</div>
                      </div>
                    </div>

                    {/* Launch Round/Matchmaker Button */}
                    <div className="max-w-sm mx-auto">
                      <button
                        onClick={startMatchmaking}
                        disabled={balance < ENTRY_FEE}
                        className="w-full relative flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-extrabold uppercase tracking-widest text-xs px-6 py-4 border border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none group select-none"
                      >
                        <Search size={16} className="group-hover:rotate-12 transition-transform" />
                        Искать Оппонента
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                      </button>
                    </div>

                    <p className="mt-3 text-[10px] text-slate-500 font-medium">
                      * Поиск происходит среди реальных игроков онлайн. При желании вы сможете мгновенно подключить тренировочного ИИ-бота в процессе сканирования.
                    </p>
                  </section>
                )}

                {/* SEARCHING RADAR SCANNER STATE */}
                {isSearching && (
                  <section className="rounded-3xl border border-indigo-500/30 bg-slate-950/80 p-6 md:p-8 shadow-2xl backdrop-blur-md relative overflow-hidden flex flex-col items-center justify-center text-center">
                    {/* Glowing radar screen background */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.06),transparent_60%)]"></div>

                    {/* Radar Screen Layout */}
                    <div className="relative w-48 h-48 rounded-full border border-indigo-500/20 bg-slate-950 flex items-center justify-center mb-6">
                      {/* Rotating radial beam line */}
                      <div className="absolute inset-1 rounded-full border border-indigo-500/10"></div>
                      <div className="absolute inset-6 rounded-full border border-indigo-500/10"></div>
                      <div className="absolute inset-12 rounded-full border border-indigo-500/5"></div>
                      
                      {/* Rotating Sweep beam */}
                      <div className="absolute top-1/2 left-1/2 w-24 h-[1.5px] bg-gradient-to-r from-indigo-500 to-transparent origin-left -translate-y-1/2 animate-[spin_3s_linear_infinite]" style={{ transformOrigin: "0% 50%" }}></div>

                      {/* Blinking Targets */}
                      <div className="absolute top-12 left-16 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></div>
                      <div className="absolute bottom-16 right-12 w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse"></div>

                      <div className="z-10 text-indigo-400">
                        <Crosshair size={32} className="animate-pulse" />
                      </div>
                    </div>

                    <div className="z-10">
                      <div className="text-xs font-black uppercase text-indigo-400 tracking-widest animate-pulse flex items-center justify-center gap-2">
                        <Radio size={12} className="animate-pulse" /> Сканирование сети Лиги...
                      </div>
                      <div className="text-2xl font-black font-mono text-white mt-1">
                        00:{searchDuration < 10 ? `0${searchDuration}` : searchDuration}
                      </div>
                      
                      {/* Live Network Indicators */}
                      <div className="mt-3 flex items-center justify-center gap-3 select-none">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-[10px] font-bold font-mono text-indigo-300">
                          Игроков онлайн: {onlineCount}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[10px] font-bold font-mono text-emerald-400">
                          В поиске: {queueCount}
                        </span>
                      </div>

                      <p className="mt-4 text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                        Защищенный сокет подключен. Ожидаем входа свободного соперника в реальном времени...
                      </p>
                    </div>

                    <div className="mt-6 w-full max-w-xs z-10 flex flex-col gap-2.5">
                      <button
                        onClick={forceBotMatch}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-transparent bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] transition-all py-3 text-xs font-bold uppercase tracking-wider select-none cursor-pointer shadow-lg shadow-amber-500/10"
                      >
                        Сыграть с ИИ-ботом прямо сейчас
                      </button>
                      <button
                        onClick={cancelMatchmaking}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white transition-all py-2 text-xs font-bold uppercase tracking-wider select-none cursor-pointer"
                      >
                        Отменить Поиск
                      </button>
                    </div>
                  </section>
                )}

                {/* ACTIVE LIVE GAME PLAYING STATE */}
                {activeMatch && (
                  <section className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-2xl backdrop-blur-md md:p-7 relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
                    
                    {/* Header: Duel Info Details */}
                    <div className="mb-6 rounded-2xl bg-slate-900/50 border border-white/5 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                      {/* Left: You */}
                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center text-2xl border border-indigo-400/30 shrink-0">
                          🧑‍🚀
                        </div>
                        <div className="text-left">
                          <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold block">Ты (Игрок)</span>
                          <span className="font-extrabold text-sm text-white block truncate max-w-[120px]">
                            {tgUser ? (tgUser.username ? `@${tgUser.username}` : tgUser.first_name) : `Игрок_${socket?.id?.substring(0, 4)}`}
                          </span>
                        </div>
                      </div>

                      {/* Middle VS Badge Divider */}
                      <div className="flex flex-col items-center justify-center shrink-0">
                        <span className="text-xs font-black tracking-widest text-[#6366f1] bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full animate-pulse uppercase">
                          HOLOGRAPHIC VS
                        </span>
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest mt-1">Серверный Дуэль</span>
                      </div>

                      {/* Right: Opponent */}
                      <div className="flex items-center gap-3 w-full md:w-auto md:flex-row-reverse text-right">
                        <div className="h-12 w-12 rounded-xl bg-slate-950 flex items-center justify-center text-2xl border border-slate-700 shrink-0">
                          {activeMatch.opponent.avatar}
                        </div>
                        <div className="text-left md:text-right">
                          <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold block">Оппонент</span>
                          <span className="font-extrabold text-sm text-white block truncate max-w-[120px]" title={activeMatch.opponent.name}>
                            {activeMatch.opponent.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Option to search for another player (visible immediately at the top) */}
                    {!matchResultState && (
                      <div className="mb-5">
                        <button
                          onClick={searchAnotherOpponent}
                          className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#6366f1]/30 hover:border-indigo-400 bg-slate-900/40 text-indigo-300 hover:text-white transition-all py-3.5 text-xs font-black uppercase tracking-widest select-none cursor-pointer"
                        >
                          <RefreshCw size={13} className="animate-spin-slow text-indigo-400" />
                          Поиск другого игрока
                        </button>
                      </div>
                    )}

                    {/* Dossier status of the opponent */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={String(revealedIds.has(activeMatch.opponent.id as any))}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="mb-5 rounded-3xl border border-white/5 bg-slate-950/40 p-5 backdrop-blur shadow-inner"
                      >
                        {!revealedIds.has(activeMatch.opponent.id as any) ? (
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-start gap-4">
                              <div className="rounded-2xl bg-slate-900 border border-slate-700/50 p-3 text-slate-300 flex items-center justify-center shrink-0">
                                <Lock size={22} className="text-amber-400 animate-pulse" />
                              </div>
                              <div className="text-left">
                                <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-tight">Досье заблокировано</h3>
                                <p className="mt-1 max-w-xl text-xs text-slate-400 leading-relaxed">
                                  Для разблокировки истории предательств и уязвимостей оппонента запросите выписку. Для заблокированных профилей виден факт скрытия.
                                </p>
                              </div>
                            </div>
                            <div className="w-full md:w-56 shrink-0 md:pl-2">
                              <ActionButton
                                onClick={() => {
                                  if (balance >= REVEAL_FEE) {
                                    triggerHaptic("light");
                                    setBalance((v) => Number((v - REVEAL_FEE).toFixed(2)));
                                    setRevealedIds((prev) => {
                                      const next = new Set(prev);
                                      next.add(activeMatch.opponent.id as any);
                                      return next;
                                    });
                                    setMessage(`Досье открыто: ${activeMatch.opponent.name} имеет стиль: ${activeMatch.opponent.style}.`);
                                  } else {
                                    triggerHaptic("error");
                                    setMessage("Недостаточно средств для раскрытия досье.");
                                  }
                                }}
                                disabled={balance < REVEAL_FEE}
                                variant="amber"
                                icon={Eye}
                              >
                                Раскрыть за {fmt(REVEAL_FEE)}
                              </ActionButton>
                            </div>
                          </div>
                        ) : activeMatch.opponent.profileHidden ? (
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between text-left">
                            <div className="flex items-start gap-4">
                              <div className="rounded-2xl bg-purple-950/40 border border-purple-800/30 p-3 text-white flex items-center justify-center shrink-0">
                                <UserX size={22} className="text-purple-400" />
                              </div>
                              <div className="text-left">
                                <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-tight text-purple-200">Досье скрыто оппонентом</h3>
                                <p className="mt-1 max-w-xl text-xs text-slate-400 leading-relaxed">
                                  Оппонент активировал режим шифрования профиля. Точный процент предательств не может быть извлечен, но сам залог конфиденциальности является сигналом тактического прагматизма.
                                </p>
                              </div>
                            </div>
                            <div className="rounded-xl border border-purple-500/20 bg-purple-500/10 px-4 py-2 text-xs font-black text-purple-400 uppercase tracking-wider text-center shrink-0">
                              неизвестно
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-left">
                            <div className="rounded-2xl bg-slate-900/50 p-4 shadow-sm border border-slate-800 flex flex-col justify-between">
                              <div>
                                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Процент предательств</span>
                                <div className="mt-1.5 text-3xl font-black font-mono text-red-400 leading-none">
                                  {activeMatch.opponent.games ? Math.round((activeMatch.opponent.betrayals / activeMatch.opponent.games) * 100) : 40}%
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-slate-500 font-medium">
                                {activeMatch.opponent.betrayals} предательств из {activeMatch.opponent.games} игр
                              </div>
                            </div>
                            <div className="rounded-2xl bg-slate-900/50 p-4 shadow-sm border border-slate-800 flex flex-col justify-between">
                              <div>
                                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Уровень риска</span>
                                <div className="mt-1.5">
                                  {(() => {
                                    const rate = activeMatch.opponent.games ? Math.round((activeMatch.opponent.betrayals / activeMatch.opponent.games) * 100) : 40;
                                    const r = riskLabel(rate);
                                    return (
                                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${r.tone}`}>
                                        {r.title}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-slate-400 font-medium">
                                {activeMatch.opponent.style || "хаотичный"} стиль игры
                              </div>
                            </div>
                            <div className="rounded-2xl bg-slate-900/50 p-4 shadow-sm border border-slate-800 flex flex-col justify-between">
                              <div>
                                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Характер</span>
                                <div className="mt-1.5 text-xs font-semibold text-slate-300 leading-snug">
                                  Рекомендуем играть осторожно, адаптируясь под выявленный класс поведения игрока.
                                </div>
                              </div>
                              <div className="text-[9px] text-[#6366f1] uppercase font-black tracking-widest mt-2">Анализ завершен</div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>

                    {/* Game payout guidelines (Таблица выплат) */}
                    <div className="mb-5 rounded-3xl border border-slate-800 bg-slate-900/40 p-4">
                      <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className="text-amber-500" /> Спецификация залога
                        </div>
                        <div className="font-mono text-[10px] text-indigo-400">Вход: {fmt(ENTRY_FEE)}</div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-left">
                        <div className="rounded-2xl bg-emerald-950/20 p-4 border border-emerald-500/20">
                          <div className="font-extrabold text-emerald-400 uppercase text-xs tracking-wider">Оба сотрудничают</div>
                          <div className="text-xs text-emerald-300 mt-1">Оба получают {fmt(COOPERATION_PAYOUT)}</div>
                        </div>
                        <div className="rounded-2xl bg-purple-950/20 p-4 border border-purple-500/20">
                          <div className="font-extrabold text-purple-400 uppercase text-xs tracking-wider">Один предает</div>
                          <div className="text-xs text-purple-300 mt-1">Предатель заберет {fmt(SOLO_BETRAYAL_PAYOUT)}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-700/50">
                          <div className="font-extrabold text-slate-300 uppercase text-xs tracking-wider">Оба предали</div>
                          <div className="text-xs text-slate-400 mt-1">Оба вернут залоги в сумме {fmt(DOUBLE_BETRAYAL_PAYOUT)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Match Action Selection Block */}
                    {!matchResultState && (
                      <div className="space-y-4">
                        {!isWaitingForOpponent ? (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <ActionButton onClick={() => submitMatchAction("cooperate")} variant="green" icon={ShieldCheck}>
                              Сотрудничать 🤝
                            </ActionButton>
                            <ActionButton onClick={() => submitMatchAction("betray")} variant="red" icon={Skull}>
                              Предать 💀
                            </ActionButton>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-white/5 bg-slate-950 p-6 flex flex-col items-center justify-center text-center">
                            <span className="relative flex h-5 w-5 mb-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-5 w-5 bg-indigo-500"></span>
                            </span>
                            <div className="text-xs font-black uppercase text-indigo-400 tracking-widest animate-pulse">Ожидаем решение оппонента</div>
                            <p className="mt-1 text-[10px] text-slate-500 uppercase font-bold tracking-wiest">
                              Твой выбор принят сервером и заблокирован от модификации.
                            </p>
                          </div>
                        )}

                        {/* Blinking Badge if Opponent has submitted first */}
                        {opponentSubmitted && !isWaitingForOpponent && (
                          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-2 flex items-center justify-center gap-2 text-[10px] font-black text-sky-400 uppercase tracking-widest text-center shadow-lg animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping"></span>
                            Соперник принял свое решение! Выберите ответное действие!
                          </div>
                        )}
                      </div>
                    )}

                    {/* Result and Reveal Screen */}
                    {matchResultState && (
                      <div className="rounded-3xl bg-slate-950 p-5 border border-indigo-500/20 text-slate-100 text-left">
                        <div className="text-xs font-black uppercase text-[#6366f1] tracking-widest flex items-center gap-1.5 mb-3">
                          <Radio size={12} className="text-indigo-400 animate-pulse" /> Результат серверного урегулирования
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Твой выбор</span>
                            <span className={`text-xs font-extrabold uppercase mt-1 block ${matchResultState.playerAction === "betray" ? "text-red-400" : "text-emerald-400"}`}>
                              {matchResultState.playerAction === "betray" ? "Предал 💀" : "Сотрудничал 🤝"}
                            </span>
                          </div>
                          <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Выбор соперника</span>
                            <span className={`text-xs font-extrabold uppercase mt-1 block ${matchResultState.opponentAction === "betray" ? "text-red-400" : "text-emerald-400"}`}>
                              {matchResultState.opponentAction === "betray" ? "Предал 💀" : "Сотрудничал 🤝"}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl border border-white/5 bg-slate-900/60 mb-5">
                          <h3 className="text-sm font-black uppercase text-indigo-300 leading-none">{matchResultState.title}</h3>
                          <p className="mt-2 text-xs text-slate-400 leading-relaxed">{matchResultState.text}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-6">
                          <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Выплата</span>
                            <span className="text-xl font-black font-mono text-[#6366f1] mt-0.5 block">{fmt(matchResultState.payout)}</span>
                          </div>
                          <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Разница залога</span>
                            <span className={`text-xl font-black font-mono mt-0.5 block ${matchResultState.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {matchResultState.net >= 0 ? "+" : ""}{fmt(matchResultState.net)}
                            </span>
                          </div>
                        </div>

                        <ActionButton onClick={completeMatch} variant="purple">
                          Завершить Дуэль & Вернуться
                        </ActionButton>
                      </div>
                    )}

                    {/* Tactical logger console */}
                    <div className="mt-5 rounded-2xl bg-slate-950 border border-indigo-500/10 p-4 text-[#94a3b8] font-mono text-[10px] flex items-start gap-3">
                      <span className="text-[#6366f1] select-none">&gt;</span>
                      <p className="flex-1 leading-snug">{message}</p>
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* Account page */}
            {activeTab === "account" && (
              <div className="mx-auto max-w-4xl space-y-6">
                {/* Profile Header */}
                <div className="rounded-3xl border border-white/10 bg-slate-800/40 p-6 md:p-8 backdrop-blur-md shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center gap-6">
                  <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
                  
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-4xl shadow-xl border border-indigo-400/40 select-none">
                    {tgUser ? "📱" : "🧑‍🚀"}
                  </div>
                  <div className="text-center md:text-left space-y-2">
                    <span className="inline-flex rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-400">
                      {isTelegram ? "Telegram Игрок" : "живой игрок"}
                    </span>
                    <h2 className="text-2xl font-black text-white leading-none">{tgUser ? tgUser.first_name : "Демо Пользователь"}</h2>
                    <p className="text-xs text-[#94a3b8] font-mono">{tgUser && tgUser.username ? `@${tgUser.username}` : "Secure Sandbox Client"}</p>
                    
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-1 text-xs">
                      <span className="text-slate-400">Trust Score (Рейтинг): <strong className="text-indigo-400 font-mono text-sm">{trustScore(playerLeagueProfile)}/100</strong></span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400">Коэфф. Предательства: <strong className={playerRate > 50 ? "text-red-400 font-mono" : "text-emerald-400 font-mono"}>{playerRate}%</strong></span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Shield and Gift */}
                  <div className="space-y-6">
                    {/* Shield Widget */}
                    <div className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-xl backdrop-blur-md relative overflow-hidden">
                      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                      <div className="mb-4 flex items-center gap-2">
                        <UserX size={18} className="text-purple-400" />
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Твой защитный щит</h3>
                      </div>
                      <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800">
                        <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/5">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Статус видимости</div>
                            <div className="text-lg font-black mt-0.5 text-white tracking-tight leading-none">{playerProfileHidden ? "CLASSIFIED (СКРЫТО)" : "UNSHIELDED (ОТКРЫТО)"}</div>
                          </div>
                          <div className={`rounded-xl px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border shrink-0 ${playerProfileHidden ? "bg-purple-950/55 text-purple-400 border-purple-500/25" : "bg-emerald-950/55 text-emerald-400 border-emerald-500/25"}`}>
                            {playerProfileHidden ? `${hiddenRoundsLeft} р.` : `${playerRate}% пред.`}
                          </div>
                        </div>
                        <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                          {playerProfileHidden
                            ? "Иные игроки не видят твои предательства, но видят метку шифрования досье. Находясь под шифрованием, ты временно теряешь право на еженедельную Лигу."
                            : "Твои конкуренты могут выкупить просмотр твоего досье за $0.10 и узнать процент предательских решений."}
                        </p>
                        <div className="mt-4">
                          <ActionButton onClick={hideMyProfile} disabled={!canHideProfile} variant="purple" icon={UserX}>
                            {playerProfileHidden ? "Защитный щит активен" : `Зашифровать за ${fmt(HIDE_FEE)}`}
                          </ActionButton>
                        </div>
                      </div>
                    </div>

                    {/* Weekly Bonus */}
                    <div className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-xl backdrop-blur-md relative overflow-hidden">
                      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>
                      <div className="mb-4 flex items-center gap-2">
                        <Gift size={18} className="text-amber-400" />
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Еженедельный бонус</h3>
                      </div>
                      <div className="rounded-2xl bg-slate-900/50 p-4 border border-amber-500/20 shadow-inner">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-widest leading-none">
                          <CalendarDays size={14} /> Сезон закроется через: 3д 14ч
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {WEEKLY_BONUS_SHARES.map((share, index) => (
                            <div key={share} className="rounded-xl bg-slate-950 p-2 text-center border border-slate-800 shadow-inner min-w-0 overflow-hidden">
                              <div className="text-[9px] font-bold text-slate-500 truncate">#{index + 1} призовое</div>
                              <div className="text-[10px] xs:text-xs font-black text-amber-400 stat-value font-mono mt-0.5 truncate" title={fmt(bonusPool * share)}>{fmt(bonusPool * share)}</div>
                              <div className="text-[8px] font-bold text-slate-500 mt-0.5 truncate">{Math.round(share * 100)}% пула</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 text-[11px] text-slate-300 leading-relaxed font-medium">
                          <b>Фонд:</b> <span className="text-amber-400 font-bold">{fmt(bonusPool)}</span>. Пополняется на <span className="text-emerald-400 font-bold">25%</span> при односторонних предательствах.
                        </div>
                        <div className="mt-4">
                          <ActionButton onClick={claimWeeklyBonus} disabled={!canClaimWeeklyBonus} variant="amber" icon={Gift}>
                            {weeklyBonusClaimed
                              ? "Бонус уже был забран"
                              : playerWeeklyBonus > 0
                                ? `Перевести на баланс ${fmt(playerWeeklyBonus)}`
                                : "Ты пока не в топ-3 зачета"}
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: League Board & Reset */}
                  <div className="space-y-6">
                    {/* Trust League Board */}
                    <div className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-xl backdrop-blur-md relative overflow-hidden">
                      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"></div>
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Trophy size={18} className="text-amber-400" />
                          <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Лига доверия</h3>
                        </div>
                        <span className="text-[9px] text-[#94a3b8] font-black uppercase bg-slate-800/70 border border-slate-700/60 px-2 py-0.5 rounded-md">Rank 1-5</span>
                      </div>
                      <div className="space-y-2">
                        {leaderboard.map((o, index) => {
                          const isPlayer = o.isPlayer || false;
                          const oEligible = o.eligible || false;
                          const bonus = oEligible && index < 3 ? Number((bonusPool * WEEKLY_BONUS_SHARES[index]).toFixed(2)) : 0;
                          return (
                            <div key={o.id} className={`flex items-center justify-between rounded-xl p-2 border transition-all duration-200 ${
                              isPlayer 
                                ? "bg-slate-950 text-white border-indigo-500/30 shadow-lg" 
                                : "bg-slate-900/40 border-slate-800/60"
                            }`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950 text-base border border-white/5 shrink-0 select-none">
                                  {o.avatar}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1 font-extrabold text-[11px] text-slate-100 uppercase tracking-tight truncate leading-none">
                                    {bonus > 0 ? <Crown size={10} className="text-amber-400 shrink-0" /> : null}
                                    #{index + 1} {o.name}
                                  </div>
                                  <div className="text-[9px] text-slate-400 font-medium mt-1 truncate leading-none">
                                    {o.games} игр · trust score <span className="font-mono">{o.score}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0 pl-2">
                                <div className="font-black font-mono text-[11px] text-slate-100 leading-none">{o.profileHidden ? <span className="text-purple-400 text-[9px] uppercase font-bold tracking-wider">скрыто</span> : `${o.rate}%`}</div>
                                <div className="text-[9px] text-slate-500 font-bold mt-1 leading-none">
                                  {bonus > 0 ? `+${fmt(bonus)}` : oEligible ? "актив" : "неакт."}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Developer settings & reset */}
                    <div className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-xl backdrop-blur-md text-center space-y-3">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Безопасность и Настройки</h4>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Вы всегда можете сбросить прогресс игр, свои выигрыши и заново откалибровать League Score по умолчанию.
                      </p>
                      <button
                        onClick={resetGame}
                        className="w-full px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-red-500/20 bg-red-950/20 text-red-400 hover:bg-red-950/45 transition-all select-none cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                      >
                        <RefreshCw size={12} className="animate-spin-slow" /> Сбросить прогресс системы
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* History page */}
            {activeTab === "history" && (
              <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-2xl backdrop-blur-md md:p-7 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
                
                <div className="mb-6 flex items-center justify-between pb-4 border-b border-white/5">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] font-mono">История транзакций матчей</div>
                    <h3 className="text-xl font-black text-white tracking-tight uppercase mt-1 flex items-center gap-2">
                      <History size={18} className="text-slate-400" /> Протокол дуэлей ({playerGames})
                    </h3>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-slate-850 px-3 py-1 text-xs font-mono text-slate-400 font-bold shadow-inner">
                    Всего игр: {playerGames}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3 text-center">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">Сотрудничества</span>
                    <span className="text-base font-black text-emerald-400 font-mono mt-0.5">{playerGames - playerBetrayals} раз</span>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3 text-center">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">Предательства</span>
                    <span className="text-base font-black text-rose-400 font-mono mt-0.5">{playerBetrayals} раз</span>
                  </div>
                </div>

                {history.length === 0 ? (
                  <div className="rounded-2xl bg-slate-900/35 p-12 text-xs text-slate-450 border border-slate-800 text-center font-medium my-6">
                    <History size={36} className="mx-auto text-slate-700 stroke-[1.5] mb-2" />
                    <p className="text-slate-300 font-bold uppercase text-xs">Архив решений пуст</p>
                    <p className="text-slate-500 text-[11px] mt-1">Проведите дуэли во вкладке «Дуэль» чтобы наполнить лог.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1 select-none">
                    {history.map((h) => (
                      <div key={h.id} className="rounded-xl border border-slate-800 bg-slate-900/25 hover:bg-slate-900/50 transition-colors p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-xl border border-white/5 shrink-0 select-none">
                            {h.avatar}
                          </div>
                          <div>
                            <div className="font-extrabold text-xs text-slate-100 flex items-center gap-1.5 leading-none">
                              {h.opponent}
                            </div>
                            <div className="text-[10px] text-slate-400 leading-normal mt-1.5 flex items-center gap-1.5 flex-wrap">
                              <span>Ты: <strong className={h.playerAction === "betray" ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>{actionText(h.playerAction)}</strong></span>
                              <span className="text-slate-600">|</span>
                              <span>Оппонент: <strong className={h.opponentAction === "betray" ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>{actionText(h.opponentAction)}</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:flex-col sm:items-end gap-1.5 shrink-0 border-t border-white/5 sm:border-t-0 pt-2 sm:pt-0">
                          <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black font-mono leading-none ${h.net >= 0 ? "bg-emerald-950/50 text-emerald-400 border border-emerald-500/20" : "bg-red-950/50 text-red-400 border border-red-500/20"}`}>
                            {h.net >= 0 ? "+" : ""}{fmt(h.net)}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">Баланс: {fmt(h.balance)}{h.profileHiddenDuringRound ? " (скрыто)" : ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Finance combined page */}
            {activeTab === "finance" && (
              <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-slate-800/40 p-5 shadow-2xl backdrop-blur-md md:p-6 relative overflow-hidden">
                <div className={`absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent ${financeSubTab === "deposit" ? "via-emerald-500/50" : "via-rose-500/50"} to-transparent`}></div>

                {/* Unified finance sub-tab switcher */}
                <div className="flex p-0.5 bg-slate-950/70 rounded-xl border border-white/5 mb-5 select-none text-center">
                  <button
                    onClick={() => { triggerHaptic('light'); setFinanceSubTab("deposit"); }}
                    className={`flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      financeSubTab === "deposit"
                        ? "bg-slate-900 border border-white/10 text-[#10b981] shadow-md shadow-emerald-950/20"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <ArrowDownLeft size={13} />
                    Пополнить
                  </button>
                  <button
                    onClick={() => { triggerHaptic('light'); setFinanceSubTab("withdraw"); }}
                    className={`flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      financeSubTab === "withdraw"
                        ? "bg-slate-900 border border-white/10 text-[#f43f5e] shadow-md shadow-rose-950/20"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <ArrowUpRight size={13} />
                    Вывод
                  </button>
                </div>

                {financeSubTab === "deposit" ? (
                  <div className="animate-fade-in">
                    <div className="mb-5 flex items-center justify-between pb-3 border-b border-white/5">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#10b981] font-mono">Merchant Payment</div>
                    <h3 className="text-xl font-black text-white tracking-tight uppercase mt-1 flex items-center gap-2">
                      <ArrowDownLeft size={18} className="text-[#10b981]" /> Пополнить баланс
                    </h3>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-slate-400 uppercase font-mono">Ваш баланс</div>
                    <div className="text-lg font-black text-[#10b981] font-mono leading-none mt-1">{fmt(balance)}</div>
                  </div>
                </div>

                <p className="text-xs text-slate-350 leading-relaxed mb-5">
                  Выберите номинал для мгновенной имитации начисления демо-средств на ваш счёт без использования фиатных платежей:
                </p>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  {[10, 25, 50, 100].map((amt) => {
                    const titles = {
                      10: "Бронзовый Ключ",
                      25: "Серебряный Кейс",
                      50: "Золотой Сундук",
                      100: "Платиновая Насыпь",
                    };
                    return (
                      <button
                        key={amt}
                        onClick={() => { triggerHaptic('light'); setDepositAmount(amt); setCustomDeposit(""); }}
                        className={`rounded-xl border p-3.5 text-left transition-all relative overflow-hidden select-none cursor-pointer ${
                          depositAmount === amt && !customDeposit
                            ? "bg-slate-950 text-white border-emerald-500/80 shadow-md shadow-emerald-950/20"
                            : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80 text-slate-300"
                        }`}
                      >
                        {depositAmount === amt && !customDeposit && (
                          <div className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-emerald-505 bg-emerald-500 rounded-bl-lg flex items-center justify-center text-[8px] text-white select-none font-bold">✓</div>
                        )}
                        <span className="text-[8px] font-bold text-slate-500 uppercase block tracking-wider">{titles[amt as 10 | 25 | 50 | 100]}</span>
                        <span className="text-xl font-black font-mono text-[#10b981] mt-1 block leading-none">+${amt}.00</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mb-5 space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block">Своя сумма пополнения</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">$</span>
                    <input
                      type="number"
                      placeholder="Ввести другую сумму..."
                      value={customDeposit}
                      onChange={(e) => setCustomDeposit(e.target.value)}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-2.5 pl-7 pr-3 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="mb-5 space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block">Канал зачисления</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "crypto", label: "USDT / TON", icon: Coins },
                      { id: "stars", label: "TG Stars ⭐", icon: Crown },
                      { id: "card", label: "Карта Visa", icon: CreditCard },
                    ].map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.id}
                          onClick={() => { triggerHaptic('light'); setDepositMethod(m.id as "crypto" | "stars" | "card"); }}
                          className={`rounded-lg border py-2 px-1 text-[10px] font-bold flex flex-col items-center gap-1.5 transition-all select-none cursor-pointer ${
                            depositMethod === m.id
                              ? "bg-emerald-950/25 border-emerald-500/40 text-[#10b981]"
                              : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-300"
                          }`}
                        >
                          <Icon size={12} />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {depositStatus && (
                  <div className="mb-4 rounded-xl bg-slate-950 p-3 border border-emerald-500/15 text-center shadow-inner">
                    {isDepositing && (
                      <div className="inline-block relative w-3 h-3 border-2 border-[#10b981] border-t-transparent rounded-full animate-spin mr-2 md:mr-2.5 vertical-middle animate-spin" />
                    )}
                    <span className="text-[11px] font-mono font-medium text-[#10b981] align-middle leading-none">{depositStatus}</span>
                  </div>
                )}

                    <ActionButton onClick={handleDeposit} disabled={isDepositing} variant="green" icon={ArrowDownLeft}>
                      {isDepositing ? "Выполнение шлюзового запроса..." : `Начислить $${customDeposit ? Number(customDeposit).toFixed(2) : depositAmount.toFixed(2)}`}
                    </ActionButton>
                  </div>
                ) : (
                  <div className="animate-fade-in">
                    <div className="mb-5 flex items-center justify-between pb-3 border-b border-white/5">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#f43f5e] font-mono">Blockchain Gateway</div>
                        <h3 className="text-xl font-black text-white tracking-tight uppercase mt-1 flex items-center gap-2">
                          <ArrowUpRight size={18} className="text-[#f43f5e]" /> Вывести средства
                        </h3>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-slate-400 uppercase font-mono">Баланс доступно</div>
                        <div className="text-lg font-black text-[#f43f5e] font-mono leading-none mt-1">{fmt(balance)}</div>
                      </div>
                </div>

                <p className="text-xs text-slate-350 leading-relaxed mb-5">
                  Оформите вывод накопленного демократического баланса Дуэлей. Имитация транзакции смарт-контракта децентрализованных финансов.
                </p>

                <div className="mb-5 space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block">Сеть получения</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "trc20", label: "USDT TRC-20" },
                      { id: "stars", label: "TG Stars ⭐" },
                      { id: "card", label: "Банк Карта" },
                    ].map((w) => (
                      <button
                        key={w.id}
                        onClick={() => { triggerHaptic('light'); setWithdrawMethod(w.id as "trc20" | "stars" | "card"); }}
                        className={`rounded-lg border p-2 text-[10px] text-center transition-all select-none cursor-pointer ${
                          withdrawMethod === w.id
                            ? "bg-rose-955/20 border-rose-500/40 text-[#f43f5e] font-bold"
                            : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-300"
                        }`}
                      >
                        <span>{w.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block">Сумма к выводу</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { triggerHaptic('light'); setWithdrawAmount((balance / 2).toFixed(2)); }}
                        className="px-2 py-0.5 rounded bg-slate-900 text-[9px] font-bold text-[#94a3b8] hover:bg-slate-800 cursor-pointer"
                      >
                        50%
                      </button>
                      <button
                        onClick={() => { triggerHaptic('light'); setWithdrawAmount(balance.toFixed(2)); }}
                        className="px-2 py-0.5 rounded bg-slate-900 text-[9px] font-bold text-[#94a3b8] hover:bg-slate-800 cursor-pointer"
                      >
                        Все
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-2.5 pl-7 pr-3 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-[#f43f5e]"
                    />
                  </div>
                </div>

                <div className="mb-5 space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block">
                    {withdrawMethod === "trc20"
                      ? "Адрес USDT TRC-20 ресивера"
                      : withdrawMethod === "stars"
                        ? "Телеграм ID получателя"
                        : "Номер карты (16 цифр)"}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      withdrawMethod === "trc20"
                        ? "TR7NHqeVgW5923n... (34 символа)"
                        : withdrawMethod === "stars"
                          ? "Ваш Telegram ID"
                          : "4276 •••• •••• 0000"
                    }
                    value={withdrawAddress}
                    onChange={(e) => setWithdrawAddress(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-2.5 px-3.5 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-[#f43f5e] transition-all"
                  />
                </div>

                {(isWithdrawing || withdrawLogs.length > 0) && (
                  <div className="mb-5 rounded-xl bg-slate-950 p-3 border border-rose-500/10 font-mono text-[9px] space-y-1 select-text text-left max-h-[140px] overflow-y-auto shadow-inner">
                    {withdrawLogs.map((log, index) => {
                      let color = "text-slate-400";
                      if (log.startsWith("[SUCCESS]")) color = "text-emerald-400 font-bold";
                      else if (log.startsWith("[OK]")) color = "text-indigo-400";
                      else if (log.startsWith("[SYS]")) color = "text-amber-400";
                      return (
                        <div key={index} className={color}>
                          {log}
                        </div>
                      );
                    })}
                    {isWithdrawing && (
                      <div className="text-rose-450 text-[#f43f5e] animate-pulse text-[8px] flex items-center gap-1 mt-1 font-bold">
                        <span className="inline-block w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                        ОЧЕРЕДЬ ТРАНЗАКЦИЙ, ОЖИДАНИЕ ТЕСТОВОЙ ПРОВЕРКИ...
                      </div>
                    )}
                  </div>
                )}

                {withdrawStatus && (
                  <div className="mb-4 rounded-xl bg-slate-950 p-3 border border-rose-500/15 text-center shadow-inner">
                    <span className="text-[11px] font-mono font-medium text-[#f43f5e] leading-none">{withdrawStatus}</span>
                  </div>
                )}

                <ActionButton onClick={handleWithdraw} disabled={isWithdrawing} variant="red" icon={ArrowUpRight}>
                  {isWithdrawing ? "Перевод выполняется..." : "Инициировать выплату"}
                </ActionButton>
                  </div>
                )}
              </div>
            )}

            {/* Rules screen */}
            {activeTab === "rules" && (
              <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-2xl backdrop-blur-md md:p-7 relative overflow-hidden animate-fade-in text-slate-200">
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
                
                <div className="mb-6 flex items-center justify-between pb-4 border-b border-white/5">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#818cf8] font-mono leading-none">Game Documentation</div>
                    <h3 className="text-xl font-black text-white tracking-tight uppercase mt-2.5 flex items-center gap-2">
                      <BookOpen size={18} className="text-indigo-400 animate-pulse" /> Правила игры: «Дилемма Доверия»
                    </h3>
                  </div>
                </div>

                <div className="space-y-6 text-xs md:text-sm font-medium leading-relaxed select-none">
                  <p className="text-slate-350">
                    Добро пожаловать в психологический поединок по теории игр (Крипто-Дилемма заключенного). Здесь корыстный расчет сталкивается со стратегическим доверием.
                  </p>
                  
                  <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-300">
                    <p className="font-bold mb-1 uppercase tracking-wider text-[10px]">Суть Игры:</p>
                    Каждый раунд вы с оппонентом тайно выбираете одно из двух действий: <b>Сотрудничать</b> или <b>Предать</b>. Входной взнос за раунд составляет <b>{fmt(ENTRY_FEE)}</b>.
                  </div>

                  <div className="space-y-3">
                    <p className="font-bold text-white uppercase tracking-wider text-[10px] text-slate-400">Сценарии расчета:</p>
                    <ul className="space-y-1.5 list-disc list-inside text-xs">
                      <li>
                        🤝 <span className="text-emerald-400 font-bold">Оба Сотрудничают:</span> Синергия и доверие. Каждый игрок получает выплату по <span className="font-mono text-emerald-300 font-bold">{fmt(COOPERATION_PAYOUT)}</span> (чистая прибыль <span className="font-bold text-emerald-400">+{fmt(COOPERATION_PAYOUT - ENTRY_FEE)}</span>).
                      </li>
                      <li>
                        🔪 <span className="text-purple-400 font-bold">Один Предает (Предательство):</span> Если ты выбрал предать, а соперник сотрудничать — ты забираешь выплату <span className="font-semibold text-emerald-300 font-bold">{fmt(SOLO_BETRAYAL_PAYOUT)}</span> (чистая прибыль <span className="font-bold text-emerald-400">+{fmt(SOLO_BETRAYAL_PAYOUT - ENTRY_FEE)}</span>), а соперник получает <span className="text-red-400 font-bold">{fmt(0)}</span> (чистый убыток <span className="text-red-450 text-[#f43f5e] font-bold">-{fmt(ENTRY_FEE)}</span>). При этом <span className="text-amber-300 font-semibold">{fmt(BONUS_POOL_CUT)}</span> взноса уходит в <b>Бонусный фонд</b>.
                      </li>
                      <li>
                        ⚔️ <span className="text-red-450 text-[#f43f5e] font-semibold">Оба Предали:</span> Взаимное недоверие. Раунд аннулируется, игрокам выплачивается по <span className="font-mono text-slate-400 font-bold">{fmt(DOUBLE_BETRAYAL_PAYOUT)}</span> (возврат базового взноса, чистая прибыль <span className="font-bold text-slate-400">{fmt(0)}</span>).
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <p className="font-bold text-white uppercase tracking-wider text-[10px] text-slate-400">Дополнительные механики:</p>
                    <div className="space-y-1 text-xs">
                      <p>
                        👁️ <b>Проверка досье:</b> За <span className="text-amber-400 font-bold">{fmt(REVEAL_FEE)}</span> перед ходом можно открыть аналитическую сводку по сопернику. Ты увидишь его стиль игры и точный процент прошлых предательств.
                      </p>
                      <p className="mt-1">
                        🛡️ <b>Шифрование (Защитный щит):</b> За <span className="text-purple-400 font-bold">{fmt(HIDE_FEE)}</span> ты можешь полностью скрыть свои показатели от проверок на следующие <b>{HIDE_DURATION} раундов</b>. Соперник будет видеть твой статус как «Скрыто».
                      </p>
                      <p className="mt-1">
                        🏆 <b>Еженедельный призовой пул:</b> Игроки, занявшие <b>Топ-3</b> места в Лиге доверия по итогам недели, разделяют накопительный бонусный фонд (<b>50%</b> первому месту, <b>30%</b> второму, <b>20%</b> третьему). Для участия нужно сыграть минимум <b>{MIN_GAMES_FOR_WEEKLY_BONUS} игр</b> без активного скрытия профиля.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-white/5 flex justify-center">
                  <button
                    onClick={() => { triggerHaptic('medium'); setActiveTab("play"); }}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-550 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all select-none cursor-pointer flex items-center gap-2 shadow-lg hover:shadow-indigo-500/20 active:scale-95 text-center"
                  >
                    Перейти к битве <Gamepad2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#090d16]/95 border-t border-white/10 backdrop-blur-xl py-2 px-4 shadow-[0_-10px_25px_rgba(0,0,0,0.6)] pb-safe">
          <div className="mx-auto max-w-md flex items-center justify-between gap-1 select-none">
            
            {/* Account Tab Button */}
            <button
              onClick={() => { triggerHaptic('light'); setActiveTab("account"); }}
              className={`flex flex-col items-center justify-center gap-1 transition-all flex-1 py-1 cursor-pointer ${activeTab === "account" ? "text-indigo-400 font-extrabold" : "text-slate-400 hover:text-slate-200"}`}
            >
              <User size={18} className={activeTab === "account" ? "scale-110 active:scale-95 transition-transform text-[#6366f1]" : ""} />
              <span className="text-[9px] tracking-tight uppercase">Профиль</span>
            </button>

            {/* History Tab Button */}
            <button
              onClick={() => { triggerHaptic('light'); setActiveTab("history"); }}
              className={`flex flex-col items-center justify-center gap-1 transition-all flex-1 py-1 cursor-pointer ${activeTab === "history" ? "text-indigo-400 font-extrabold" : "text-slate-400 hover:text-slate-200"}`}
            >
              <History size={18} className={activeTab === "history" ? "scale-110 active:scale-95 transition-transform text-[#6366f1]" : ""} />
              <span className="text-[9px] tracking-tight uppercase">История</span>
            </button>

            {/* Central Play Badge */}
            <button
              onClick={() => { triggerHaptic('medium'); setActiveTab("play"); }}
              className="relative flex flex-col items-center justify-center -mt-6 shrink-0 z-50 px-3 cursor-pointer"
            >
              <div className={`p-3.5 rounded-full bg-gradient-to-tr ${activeTab === "play" ? "from-indigo-600 to-indigo-550 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] border-indigo-400" : "from-slate-800 to-slate-900 text-slate-300 shadow-md border-slate-700"} border-2 flex items-center justify-center scale-105 active:scale-95 transition-all text-center`}>
                <Gamepad2 size={20} className={activeTab === "play" ? "animate-pulse text-white" : "text-slate-300"} />
              </div>
              <span className={`text-[8px] tracking-wider font-extrabold uppercase mt-1 ${activeTab === "play" ? "text-indigo-400 font-black" : "text-slate-400"}`}>Дуэль</span>
            </button>

            {/* Finance Tab Button */}
            <button
              onClick={() => { triggerHaptic('light'); setActiveTab("finance"); }}
              className={`flex flex-col items-center justify-center gap-1 transition-all flex-1 py-1 cursor-pointer ${activeTab === "finance" ? "text-emerald-400 font-extrabold" : "text-slate-400 hover:text-slate-200"}`}
            >
              <Wallet size={18} className={activeTab === "finance" ? "scale-110 active:scale-95 transition-transform text-[#10b981]" : ""} />
              <span className="text-[9px] tracking-tight uppercase font-bold">Финансы</span>
            </button>

            {/* Rules Tab Button */}
            <button
              onClick={() => { triggerHaptic('light'); setActiveTab("rules"); }}
              className={`flex flex-col items-center justify-center gap-1 transition-all flex-1 py-1 cursor-pointer ${activeTab === "rules" ? "text-indigo-400 font-extrabold" : "text-slate-400 hover:text-slate-200"}`}
            >
              <BookOpen size={18} className={activeTab === "rules" ? "scale-110 active:scale-95 transition-transform text-[#6366f1]" : ""} />
              <span className="text-[9px] tracking-tight uppercase font-bold">Правила</span>
            </button>

          </div>
        </nav>



        {/* Interactive Duel Result Modal Popup */}
        <AnimatePresence>
          {showResultPopup && lastResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
              onClick={() => setShowResultPopup(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl overflow-hidden select-none"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Accent line based on score net */}
                <div className={`absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent ${lastResult.net > 0 ? "via-emerald-500" : lastResult.net < 0 ? "via-rose-500" : "via-slate-550"} to-transparent`}></div>
                
                <h3 className="text-xs font-bold text-slate-400 tracking-widest uppercase text-center mb-4 leading-none">
                  Результат дуэли
                </h3>

                {/* Matchup visual comparison */}
                <div className="flex items-center justify-between mb-5 bg-slate-950/60 p-4 rounded-2xl border border-white/5 relative overflow-hidden">
                  {/* Left Player (You) */}
                  <div className="flex flex-col items-center gap-1.5 flex-1 z-10">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-550 border border-indigo-400/30 flex items-center justify-center text-2xl shadow-md select-none">
                      {isTelegram ? "📱" : "🧑‍🚀"}
                    </div>
                    <span className="text-[11px] font-bold text-slate-300">Ты</span>
                    <span className={`text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-md ${
                      lastResult.playerAction === "betray" ? "bg-red-550/10 text-red-400 border border-red-500/15" : "bg-emerald-550/10 text-emerald-400 border border-emerald-500/15"
                    }`}>
                      {lastResult.playerAction === "betray" ? "Предал" : "Сотрудничал"}
                    </span>
                  </div>

                  {/* VS indicator */}
                  <div className="flex flex-col items-center text-slate-500 space-y-1 mx-2 shrink-0">
                    <span className="text-[11px] font-black tracking-widest text-[#6366f1] animate-pulse">VS</span>
                    <div className="h-[1px] w-6 bg-slate-800" />
                  </div>

                  {/* Right Player (Opponent) */}
                  <div className="flex flex-col items-center gap-1.5 flex-1 z-10">
                    <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-center text-3xl shadow-md select-none">
                      {currentOpponent.avatar}
                    </div>
                    <span className="text-[11px] font-bold text-slate-300 truncate max-w-[80px]">{currentOpponent.name}</span>
                    <span className={`text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-md ${
                      lastResult.opponentAction === "betray" ? "bg-red-550/10 text-red-400 border border-red-500/15" : "bg-emerald-550/10 text-emerald-400 border border-emerald-500/15"
                    }`}>
                      {lastResult.opponentAction === "betray" ? "Предал" : "Сотрудничал"}
                    </span>
                  </div>
                </div>

                {/* Outcome badge & subtitle */}
                <div className="text-center mb-6">
                  <div className={`text-xl font-black uppercase tracking-tight ${
                    lastResult.net > 0 ? "text-emerald-400" : lastResult.net < 0 ? "text-[#f43f5e]" : "text-indigo-300"
                  }`}>
                    {lastResult.title}
                  </div>
                  <div className="mt-2.5 text-xs text-slate-300 leading-relaxed font-semibold px-2">
                    {lastResult.text}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="rounded-2xl bg-slate-950/40 p-3.5 border border-white/5 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Выплата за раунд</div>
                    <div className="text-lg font-black text-indigo-300 font-mono mt-0.5">{fmt(lastResult.payout)}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-950/40 p-3.5 border border-white/5 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Твоя прибыль</div>
                    <div className={`text-lg font-black font-mono mt-0.5 ${
                      lastResult.net >= 0 ? "text-emerald-400" : "text-[#f43f5e]"
                    }`}>
                      {lastResult.net >= 0 ? "+" : ""}{fmt(lastResult.net)}
                    </div>
                  </div>
                </div>

                {/* Bottom Choice CTA Row */}
                <div className="space-y-2.5">
                  <button
                    onClick={() => {
                      triggerHaptic('medium');
                      setShowResultPopup(false);
                      setMessage(`Сыграем еще раз с соперником ${currentOpponent.name}. Оцени риски и сделай выбор!`);
                    }}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-550 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/40 hover:scale-[1.01] active:scale-[0.98]"
                  >
                    Собраться на реванш <Gamepad2 size={13} />
                  </button>
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      findNewOpponent();
                    }}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-755 text-slate-300 hover:text-white font-extrabold text-xs uppercase tracking-widest rounded-xl border border-slate-700/60 transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.98]"
                  >
                    Искать нового соперника <RefreshCw size={12} className="animate-spin-slow" />
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Actions (Донат & Совет дня) */}
        <div className="fixed bottom-24 right-4 md:right-8 z-40 flex flex-col items-end gap-2.5 select-none">
          {/* Donation Floating Button */}
          <button
            onClick={() => {
              triggerHaptic('light');
              setShowDonatePopup(true);
            }}
            className="p-3.5 rounded-full bg-slate-900/95 border border-rose-500/30 text-[#f43f5e] hover:text-rose-400 shadow-[0_4px_20px_rgba(244,63,94,0.35)] hover:shadow-[0_4px_25px_rgba(244,63,94,0.55)] active:scale-95 transition-all cursor-pointer relative group flex items-center justify-center backdrop-blur-md"
            title="Поддержать автора"
          >
            {/* Outer pulsating wave ring */}
            <span className="absolute inset-0 rounded-full bg-rose-500/10 animate-ping opacity-60"></span>
            
            {/* Inner pulsing heart icon */}
            <Heart size={21} className="relative z-10 animate-pulse text-[#f43f5e]" fill="#f43f5e" />
            
            {/* Hint tag revealed on hover */}
            <span className="absolute right-full mr-3 px-2.5 py-1 text-[10px] font-bold text-[#f43f5e] bg-slate-900/95 border border-rose-500/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
              Угостить кофе ❤️️
            </span>
          </button>

          {/* Floating "Совет дня" Action Button */}
          <button
            onClick={() => {
              triggerHaptic('light');
              setShowTipPopup(true);
            }}
            className="p-3.5 rounded-full bg-slate-900/95 border border-amber-500/30 text-amber-400 hover:text-amber-300 shadow-[0_4px_20px_rgba(245,158,11,0.35)] hover:shadow-[0_4px_25px_rgba(245,158,11,0.55)] active:scale-95 transition-all cursor-pointer relative group flex items-center justify-center backdrop-blur-md"
            title="Совет дня"
          >
            {/* Outer pulsating wave ring */}
            <span className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping opacity-60"></span>
            
            {/* Inner pulsing bulb */}
            <Lightbulb size={21} className="relative z-10 animate-pulse text-amber-400" />
            
            {/* Hint tag revealed on hover */}
            <span className="absolute right-full mr-3 px-2.5 py-1 text-[10px] font-bold text-amber-400 bg-slate-900/95 border border-amber-500/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
              Совет дня
            </span>
          </button>
        </div>

        {/* Interactive Donat Modal Popup */}
        <AnimatePresence>
          {showDonatePopup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
              onClick={() => {
                setShowDonatePopup(false);
                setCopiedCard(false);
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl overflow-hidden select-none"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Dynamic accent line based on style */}
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent"></div>

                <div className="flex items-center gap-2 mb-4 justify-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#f43f5e] font-mono">Поддержка проекта</span>
                  <span className="text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider rounded-md bg-rose-500/10 text-[#f43f5e] border border-rose-500/20 font-mono">Чашка кофе ☕️</span>
                </div>

                <h3 className="text-lg font-extrabold text-white tracking-tight text-center mb-4 flex items-center justify-center gap-1.5">
                  <div className="p-2 rounded-xl bg-slate-950 border border-white/10 flex items-center justify-center text-[#f43f5e]">
                    <Coffee size={18} className="animate-pulse" />
                  </div>
                  Купить разработчику кофе
                </h3>

                <p className="text-xs md:text-sm text-slate-300 leading-relaxed text-center mb-5 px-1 font-medium">
                  Если вам нравятся Дуэли <b>Trust Duel</b> и вы хотите помочь разработчику продолжать развивать Лигу Доверия, вы можете угостить его горячей чашечкой кофе! Нам будет невероятно приятно ❤️
                </p>

                {/* Styled Credit Card / Donation Info */}
                <div 
                  onClick={() => {
                    navigator.clipboard.writeText("4441111055575918");
                    setCopiedCard(true);
                    triggerHaptic('success');
                    setTimeout(() => setCopiedCard(false), 2000);
                  }}
                  className="mb-6 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-white/10 p-5 relative overflow-hidden group cursor-pointer active:scale-[0.99] transition-all shadow-inner"
                >
                  {/* Subtle decorative credit card chip */}
                  <div className="absolute top-5 right-5 w-8 h-6 rounded bg-gradient-to-tr from-amber-500 to-amber-300/30 opacity-70 border border-amber-500/20"></div>
                  
                  <div className="text-[9px] text-slate-500 font-extrabold uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <CreditCard size={10} /> Номер банковской карты
                  </div>
                  
                  <div className="text-lg md:text-xl font-bold text-slate-100 font-mono tracking-widest group-hover:text-rose-400 transition-colors">
                    4441 1110 5557 5918
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[10px] font-semibold text-slate-400">
                    <div>ПОЛУЧАТЕЛЬ: РАЗРАБОТЧИК</div>
                    <div className="flex items-center gap-1 text-xs">
                      {copiedCard ? (
                        <span className="font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded animate-bounce">Скопировано!</span>
                      ) : (
                        <span className="font-semibold group-hover:underline flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-slate-500 group-hover:text-rose-400 transition-colors">Кликните для копирования</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setShowDonatePopup(false);
                      setCopiedCard(false);
                    }}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer border border-slate-700/60 hover:text-white"
                  >
                    Закрыть
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText("4441111055575918");
                      setCopiedCard(true);
                      triggerHaptic('success');
                      setTimeout(() => setCopiedCard(false), 2000);
                    }}
                    className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-rose-500 bg-[#e11d48] hover:bg-[#f43f5e] text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-lg shadow-rose-950/40 hover:scale-[1.01] active:scale-[0.98]"
                  >
                    Скопировать карту
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Interactive Tip Of The Day Modal Popup */}
        <AnimatePresence>
          {showTipPopup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
              onClick={() => setShowTipPopup(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl overflow-hidden select-none"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Dynamic accent line based on style */}
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>

                <div className="flex items-center gap-2 mb-4 justify-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#818cf8] font-mono">Совет дня</span>
                  <span className="text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider rounded-md bg-white/10 text-white font-mono">{tipOfDay.badge}</span>
                </div>

                <h3 className="text-lg font-extrabold text-white tracking-tight text-center mb-4 flex items-center justify-center gap-2">
                  <div className="p-2 rounded-xl bg-slate-950 border border-white/10 flex items-center justify-center text-indigo-400">
                    <tipOfDay.icon size={18} className="animate-pulse" />
                  </div>
                  {tipOfDay.label}
                </h3>

                <p className="text-xs md:text-sm text-slate-300 leading-relaxed text-center mb-5 px-1 font-medium">
                  {tipOfDay.text}
                </p>

                <div className="mb-6 p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 text-left flex items-start gap-2 font-semibold">
                  <span className="text-base shrink-0">💡</span>
                  <div>
                    <span className="font-bold">Рекомендация:</span> {tipOfDay.rec}
                  </div>
                </div>

                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setShowTipPopup(false);
                  }}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-550 text-white font-extrabold text-[#ffffff] text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/40 hover:scale-[1.01] active:scale-[0.98]"
                >
                  Понятно, спасибо!
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>


      </div>
    </div>
  );
}
