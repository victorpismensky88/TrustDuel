import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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
    <div className="rounded-2xl border border-white/10 bg-slate-800/40 p-4 shadow-lg backdrop-blur-md hover:border-indigo-500/20 transition-all duration-300 group">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-950 p-2 text-slate-300 flex items-center justify-center border border-white/5 shadow-inner">
          <Icon size={18} className="group-hover:text-indigo-400 transition-colors" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold">{label}</div>
          <div className={`text-2xl font-black mt-0.5 font-mono leading-none tracking-tight ${valueColor}`}>{value}</div>
          {sub ? <div className="text-[10px] text-slate-400 font-medium tracking-wide mt-1 uppercase">{sub}</div> : null}
        </div>
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
  const [message, setMessage] = useState<string>("Найден соперник. Можно играть вслепую или открыть досье за $0.10.");

  // Telegram integration hooks
  const [tgUser, setTgUser] = useState<{ first_name: string; username?: string; id?: number } | null>(null);
  const [isTelegram, setIsTelegram] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(true);
  const [authProgress, setAuthProgress] = useState<number>(0);
  const [authStatusText, setAuthStatusText] = useState<string>("Запуск защищенного защитного шлюза...");

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
    setMessage("Игра сброшена. Баланс снова $20.00.");
  };

  const actionText = (action: "cooperate" | "betray") => (action === "betray" ? "предал" : "сотрудничал");

  if (isAuthenticating) {
    return (
      <div className="min-h-screen bg-[#0f172a] bg-[radial-gradient(ellipse_at_top,#1e1b4b,transparent_60%),linear-gradient(185deg,#0f172a,#020617)] text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-indigo-500/30 selection:text-white">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/60 p-6 md:p-8 shadow-2xl backdrop-blur-md relative overflow-hidden text-center">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
          
          <div className="mb-6 mx-auto w-16 h-16 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-2xl flex items-center justify-center font-black text-2xl text-white shadow-xl border border-indigo-400/30 select-none animate-pulse">
            TD
          </div>

          <h1 className="text-xl font-black uppercase tracking-widest text-slate-100 mb-1">
            Trust Duel
          </h1>
          <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-6 leading-none">
            Telegram WebApp Integration
          </p>

          <div className="space-y-3 mb-6 bg-slate-950/40 p-3 rounded-2xl border border-white/5">
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
              <motion.div 
                className="bg-indigo-500 h-full"
                animate={{ width: `${authProgress}%` }}
                transition={{ ease: "easeOut" }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span className="truncate pr-2">{authStatusText}</span>
              <span className="font-bold shrink-0">{authProgress}%</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-left mb-6">
            <div className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-bold mb-2">Обнаружен аккаунт</div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-xl select-none shrink-0">
                {tgUser ? "📱" : "🧑‍🚀"}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-100 truncate leading-none">
                  {tgUser ? (tgUser.first_name) : "Демо Игрок"}
                </div>
                <div className="text-[9px] text-[#94a3b8] font-mono mt-1">
                  {tgUser && tgUser.username ? `@${tgUser.username}` : "Secure Iframe Mode"}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[9px] text-slate-500 font-mono leading-relaxed uppercase tracking-wider">
            Подключение защищено сквозным HMAC-SHA256
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] bg-[radial-gradient(ellipse_at_top,#1e1b4b,transparent_60%),linear-gradient(185deg,#0f172a,#020617)] text-slate-100 p-4 md:p-8 font-sans selection:bg-indigo-500/30 selection:text-white">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-2xl bg-slate-800/50 border border-white/10 p-5 backdrop-blur shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-lg border border-indigo-400/30 select-none">
              TD
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/40 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] shadow-sm select-none">
                  <Flame size={12} className="text-amber-400" /> Prisoner's Dilemma
                </span>
                {isTelegram && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-550/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-sky-400 shadow-sm animate-pulse select-none">
                    Telegram Active
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-black tracking-tighter uppercase text-white md:text-3xl leading-none">
                Trust Duel <span className="text-indigo-400 font-extrabold text-[#6366f1] text-base font-mono tracking-tight ml-1">v2.0</span>
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 md:gap-6 mt-2 md:mt-0">
            <button
              onClick={resetGame}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white transition-all select-none cursor-pointer flex items-center gap-2 shadow-sm"
            >
              <RefreshCw size={12} /> Сбросить демо
            </button>
          </div>
        </header>

        {/* Global Statistics Grid */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <StatCard icon={Coins} label="Баланс" value={fmt(balance)} sub="демо-счёт" />
          <StatCard icon={Users} label="Твои игры" value={playerGames} sub="сыгранные раунды" />
          <StatCard icon={Skull} label="Предательства" value={`${playerRate}%`} sub={`${playerBetrayals} из ${playerGames || 0}`} />
          <StatCard icon={Gift} label="Бонусный фонд" value={fmt(bonusPool)} sub={`из ${DEMO_SEEDED_GAMES.toLocaleString("ru-RU")} демо-игр`} />
          <StatCard icon={Trophy} label="Твой ранг" value={`#${playerWeeklyRank}`} sub="в Лиге доверия" />
        </div>

        {/* Workspace Layout */}
        <main className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-2xl backdrop-blur-md md:p-7 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
            
            <div className="mb-6 flex flex-col gap-5 md:flex-row md:items-center md:justify-between p-4 rounded-2xl bg-slate-900/50 border border-white/5">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0 select-none">
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-slate-950 text-5xl shadow-2xl border border-slate-700">
                    {currentOpponent.avatar}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-md ${
                    opponentRate > 60 ? "bg-red-600 text-white" : opponentRate < 20 ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white"
                  }`}>
                    {opponentRate > 60 ? "Danger" : opponentRate < 20 ? "Safe" : "Neutral"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">Текущий соперник</div>
                  <h2 className="text-3xl font-black text-white tracking-tight leading-none mt-1">{currentOpponent.name}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2.5 py-0.5 bg-slate-800 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-slate-700/55">
                      Стиль: {currentOpponent.style}
                    </span>
                    {currentOpponent.profileHidden && (
                      <span className="px-2.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-purple-500/20">
                        Скрытый профиль
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/60 bg-slate-950/50 px-5 py-3 md:text-right shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Входной билет</div>
                <div className="text-2xl font-black text-emerald-400 font-mono mt-0.5">{fmt(ENTRY_FEE)}</div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentOpponent.id}-${isRevealed}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="mb-5 rounded-3xl border border-white/5 bg-slate-950/40 p-5 backdrop-blur shadow-inner"
              >
                {!isRevealed ? (
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="rounded-2xl bg-slate-900 border border-slate-700/50 p-3 text-slate-300 flex items-center justify-center shrink-0">
                        <Lock size={22} className="text-amber-400 animate-pulse" />
                      </div>
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-100 uppercase tracking-tight">Досье не открыто</h3>
                        <p className="mt-1 max-w-xl text-xs text-slate-400 leading-relaxed">
                          Можно играть вслепую или открыть статистику соперника. Если игрок заранее скрыл досье за {fmt(HIDE_FEE)}, ты увидишь только факт скрытия.
                        </p>
                      </div>
                    </div>
                    <div className="w-full md:w-56 shrink-0 md:pl-2">
                      <ActionButton onClick={revealProfile} disabled={!canReveal} variant="amber" icon={Eye}>
                        Проверить за {fmt(REVEAL_FEE)}
                      </ActionButton>
                    </div>
                  </div>
                ) : currentOpponent.profileHidden ? (
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="rounded-2xl bg-purple-950/40 border border-purple-800/30 p-3 text-white flex items-center justify-center shrink-0">
                        <UserX size={22} className="text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-100 uppercase tracking-tight text-purple-200">Досье скрыто оппонентом</h3>
                        <p className="mt-1 max-w-xl text-xs text-slate-400 leading-relaxed">
                          {currentOpponent.name} заплатил за скрытие статистики. Точный процент предательств недоступен, но маскировка профиля сама по себе сигнализирует о стратегической хитрости.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/10 px-4 py-2 text-xs font-black text-purple-400 uppercase tracking-wider text-center shrink-0">
                      риск неизвестен
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-900/50 p-4 shadow-sm border border-slate-800 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Предательства</span>
                        <div className="mt-1.5 text-3xl font-black font-mono text-red-400 leading-none">{opponentRate}%</div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 font-medium">{currentOpponent.betrayals} из {currentOpponent.games} игр</div>
                    </div>
                    <div className="rounded-2xl bg-slate-900/50 p-4 shadow-sm border border-slate-800 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Уровень риска</span>
                        <div className="mt-1.5">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${risk.tone}`}>{risk.title}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-400 font-medium">{risk.hint}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-900/50 p-4 shadow-sm border border-slate-800 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Назначенная стратегия</span>
                        <div className="mt-1.5 text-xs font-semibold text-slate-300 leading-snug">
                          {opponentRate > 60 ? "Высокий шанс, что соперник выберет предательство." : "Можно пробовать сотрудничество, но гарантий нет."}
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
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
                <AlertTriangle size={14} className="text-amber-500" /> Таблица выплат по протоколу
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-emerald-950/20 p-4 border border-emerald-500/20">
                  <div className="font-extrabold text-emerald-400 uppercase text-xs tracking-wider">Оба сотрудничают</div>
                  <div className="text-xs text-emerald-300 mt-1">Игроки получают по {fmt(COOPERATION_PAYOUT)}</div>
                </div>
                <div className="rounded-2xl bg-purple-950/20 p-4 border border-purple-500/20">
                  <div className="font-extrabold text-purple-400 uppercase text-xs tracking-wider">Один предает</div>
                  <div className="text-xs text-purple-300 mt-1">Предатель получает {fmt(SOLO_BETRAYAL_PAYOUT)}</div>
                  <div className="mt-2 text-[10px] text-purple-400 font-bold uppercase">Фонд доверия +{fmt(BONUS_POOL_CUT)}</div>
                </div>
                <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-700/50">
                  <div className="font-extrabold text-slate-300 uppercase text-xs tracking-wider">Оба предали</div>
                  <div className="text-xs text-slate-400 mt-1">Каждый получает обратно {fmt(DOUBLE_BETRAYAL_PAYOUT)}</div>
                </div>
              </div>
            </div>

            {/* Core Action Zone */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ActionButton onClick={() => playRound("cooperate")} disabled={!canPlay} variant="green" icon={ShieldCheck}>
                Сотрудничать
              </ActionButton>
              <ActionButton onClick={() => playRound("betray")} disabled={!canPlay} variant="red" icon={Skull}>
                Предать
              </ActionButton>
              <ActionButton onClick={findNewOpponent} variant="light" icon={RefreshCw}>
                Искать другого
              </ActionButton>
            </div>

            {/* Dynamic Event Response Stream */}
            <div className="mt-5 rounded-3xl bg-slate-950 border border-indigo-500/20 p-5 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-indigo-800" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">Системный протокол событий</div>
              <p className="mt-2 text-base font-bold leading-relaxed text-slate-100">{message}</p>
              {lastResult ? (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-4 border-t border-white/5">
                  <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Ты выбрал</div>
                    <div className={`font-black mt-0.5 uppercase text-xs sm:text-sm ${lastResult.playerAction === "betray" ? "text-red-400" : "text-emerald-400"}`}>
                      {actionText(lastResult.playerAction)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Соперник выбрал</div>
                    <div className={`font-black mt-0.5 uppercase text-xs sm:text-sm ${lastResult.opponentAction === "betray" ? "text-red-400" : "text-emerald-400"}`}>
                      {actionText(lastResult.opponentAction)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Выплата по ходу</div>
                    <div className="font-black mt-0.5 text-indigo-300 font-mono text-sm">{fmt(lastResult.payout)}</div>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Чистый результат</div>
                    <div className={`font-black mt-0.5 font-mono text-sm ${lastResult.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {lastResult.net >= 0 ? "+" : ""}{fmt(lastResult.net)}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {/* Sidebar Section Control block */}
          <aside className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-xl backdrop-blur-md relative overflow-hidden">
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
                    <div key={share} className="rounded-xl bg-slate-950 p-2.5 text-center border border-slate-800 shadow-inner">
                      <div className="text-[10px] font-bold text-slate-500">#{index + 1} призовое</div>
                      <div className="text-sm font-black text-amber-400 stat-value font-mono mt-0.5">{fmt(bonusPool * share)}</div>
                      <div className="text-[9px] font-bold text-slate-500 mt-0.5">{Math.round(share * 100)}% пула</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl bg-slate-950/70 p-3 text-xs text-slate-300 leading-relaxed border border-slate-800/50 font-medium">
                  <b>Капитал фонда:</b> <span className="text-amber-400 font-bold">{fmt(bonusPool)}</span>. Сформирован из <span className="text-indigo-400 font-bold">{DEMO_SEEDED_GAMES.toLocaleString("ru-RU")}</span> матчей и пополняется на <span className="text-emerald-400 font-bold">25%</span> при корыстном предательстве.
                </div>
                <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                  В пул распределения попадают топ-3 верифицированных игрока с минимум {MIN_GAMES_FOR_WEEKLY_BONUS} матчами. Маскировка досье временно исключает профиль из выплат.
                </p>
                <div className="mt-4">
                  <ActionButton onClick={claimWeeklyBonus} disabled={!canClaimWeeklyBonus} variant="amber" icon={Gift}>
                    {weeklyBonusClaimed
                      ? "Бонус уже был забран"
                      : playerWeeklyBonus > 0
                        ? `Перевести на баланс ${fmt(playerWeeklyBonus)}`
                        : bonusPool <= 0
                          ? "Фонд не имеет долей"
                          : "Ты пока не в топ-3 зачета"}
                  </ActionButton>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-xl backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
              <div className="mb-4 flex items-center gap-2">
                <UserX size={18} className="text-purple-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Твой защитный щит</h3>
              </div>
              <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Статус видимости</div>
                    <div className="text-xl font-black mt-0.5 text-white tracking-tight leading-none">{playerProfileHidden ? "CLASSIFIED (СКРЫТО)" : "UNSHIELDED (ОТКРЫТО)"}</div>
                  </div>
                  <div className={`rounded-xl px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border shrink-0 ${playerProfileHidden ? "bg-purple-950/55 text-purple-400 border-purple-500/25" : "bg-emerald-950/55 text-emerald-400 border-emerald-500/25"}`}>
                    {playerProfileHidden ? `${hiddenRoundsLeft} раундов` : `${playerRate}% предательств`}
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                  {playerProfileHidden
                    ? "Иные игроки не видят твои предательства, но видят метку шифрования досье. Находясь под шифрованием, ты временно теряешь право на еженедельную Лигу ट्रस्ट."
                    : "Твои конкуренты могут выкупить просмотр твоего досье за $0.10 и узнать процент предательских решений."}
                </p>
                <div className="mt-4">
                  <ActionButton onClick={hideMyProfile} disabled={!canHideProfile} variant="purple" icon={UserX}>
                    {playerProfileHidden ? "Защитный щит активен" : `Зашифровать за ${fmt(HIDE_FEE)}`}
                  </ActionButton>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-xl backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"></div>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Trophy size={18} className="text-amber-400" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Лига доверия</h3>
                </div>
                <span className="text-[9px] text-[#94a3b8] font-black uppercase bg-slate-800/70 border border-slate-700/60 px-2 py-0.5 rounded-md">Rank 1-5</span>
              </div>
              <div className="space-y-2.5">
                {leaderboard.map((o, index) => {
                  const isPlayer = o.isPlayer || false;
                  const oEligible = o.eligible || false;
                  const bonus = oEligible && index < 3 ? Number((bonusPool * WEEKLY_BONUS_SHARES[index]).toFixed(2)) : 0;
                  return (
                    <div key={o.id} className={`flex items-center justify-between rounded-xl p-2.5 border transition-all duration-200 ${
                      isPlayer 
                        ? "bg-slate-950 text-white border-indigo-500/30 shadow-lg shadow-indigo-950/40" 
                        : "bg-slate-900/40 border-slate-800/60 hover:border-slate-700 hover:bg-slate-900/80"
                    }`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-lg border border-white/5 shrink-0 select-none">
                          {o.avatar}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 font-extrabold text-xs text-slate-100 uppercase tracking-tight truncate">
                            {bonus > 0 ? <Crown size={12} className="text-amber-400 shrink-0" /> : null}
                            #{index + 1} {o.name}
                          </div>
                          <div className={`text-[10px] ${isPlayer ? "text-indigo-200" : "text-slate-400"} font-medium mt-0.5 truncate`}>
                            {o.games} игр · trust score <span className="font-mono">{o.score}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <div className="font-black font-mono text-xs text-slate-100">{o.profileHidden ? <span className="text-purple-400 text-[10px] uppercase font-bold tracking-wider">скрыто</span> : `${o.rate}%`}</div>
                        <div className={`text-[10px] ${isPlayer ? "text-indigo-200" : "text-slate-500"} font-bold mt-0.5`}>
                          {bonus > 0 ? `бонус ${fmt(bonus)}` : oEligible ? "в рейтинге" : "неакт."}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-800/40 p-5 shadow-xl backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-slate-500/30 to-transparent"></div>
              <div className="mb-4 flex items-center gap-2">
                <History size={18} className="text-slate-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">История матчей</h3>
              </div>
              {history.length === 0 ? (
                <div className="rounded-2xl bg-slate-900/35 p-4 text-xs text-slate-400 border border-slate-800 text-center font-medium">Архив пуст. Начните дуэль по протоколу.</div>
              ) : (
                <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1 select-none">
                  {history.map((h) => (
                    <div key={h.id} className="rounded-xl border border-slate-800 bg-slate-900/25 hover:bg-slate-900/50 transition-colors p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-xs text-slate-100 flex items-center gap-1.5 leading-none">
                          <span className="text-sm select-none">{h.avatar}</span> {h.opponent}
                        </div>
                        <div className={`rounded-lg px-2 py-0.5 text-[10px] font-black font-mono ${h.net >= 0 ? "bg-emerald-950/50 text-emerald-400 border border-emerald-500/20" : "bg-red-950/50 text-red-400 border border-red-500/20"}`}>
                          {h.net >= 0 ? "+" : ""}{fmt(h.net)}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 leading-normal mt-1.5">
                        Ты: <span className={h.playerAction === "betray" ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>{actionText(h.playerAction)}</span> · Оппонент: <span className={h.opponentAction === "betray" ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>{actionText(h.opponentAction)}</span>
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1 font-mono">Баланс: {fmt(h.balance)}{h.profileHiddenDuringRound ? " (досье было скрыто)" : ""}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </main>

        <footer className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-xs font-medium text-slate-500 leading-relaxed text-center">
          <b>Важно:</b> это демо без реальных платежей. В реальном продукте бонусный фонд должен считаться на сервере, а выплаты — закрываться после окончания сезона. Юридически такую механику надо отдельно проверять на признаки азартной игры.
        </footer>
      </div>
    </div>
  );
}
