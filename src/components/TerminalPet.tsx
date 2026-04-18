import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, Cpu, ShieldCheck, Zap, Activity, Info, RefreshCw, Trash2, Moon, Sun, Database, Search } from 'lucide-react';
import { usePetGame, SPECIES, AttributeKey } from '../hooks/usePetGame';
import { cn } from '../lib/utils';

export function TerminalPet() {
  const { pet, action, summon } = usePetGame();
  const [command, setCommand] = useState('');
  const currentSpecies = SPECIES.find(s => s.id === pet.speciesId) || SPECIES[0];

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = command.toLowerCase().trim();
    setCommand('');

    if (cmd === '/buddy') {
      action('sleep'); // Just an example of interaction
    } else if (cmd === 'ls') {
      summon(); // Reset/Summon as simulation
    }
  };

  const attributeLabels: Record<AttributeKey, string> = {
    logic: '逻辑思维 (LOGIC)',
    power: '计算算力 (POWER)',
    security: '防御抗性 (DEFENSE)',
    speed: '运行速度 (SPEED)',
    luck: '玄学概率 (LUCK)'
  };

  const attributeIcons: Record<AttributeKey, any> = {
    logic: Info,
    power: Cpu,
    security: ShieldCheck,
    speed: Zap,
    luck: RefreshCw
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0c] text-[#33ff33] font-mono relative overflow-hidden rounded-3xl border-4 border-[#1a1a1a] shadow-2xl">
      {/* CRT Scanline Effect Overlay */}
      <div className="absolute inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
      
      {/* Header */}
      <div className="bg-[#1a1a1a] p-4 flex items-center justify-between border-b border-[#33ff33]/20">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-[#33ff33]" />
          <span className="text-sm font-bold tracking-widest uppercase">Project_Soul_v1.0.4.sh</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] opacity-70">
          <div className="flex items-center gap-1">
            <div className={cn("w-2 h-2 rounded-full", pet.fatigue < 80 ? "bg-[#33ff33] animate-pulse" : "bg-red-500")} />
            STATUS: {pet.fatigue < 80 ? "STABLE" : "OVERHEATED"}
          </div>
          <div>MEM: {pet.level * 1024} KB</div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row gap-6 p-6">
        {/* Left: Pet Visual & Stats */}
        <div className="flex-[1.2] flex flex-col gap-6">
          <div className="relative aspect-square rounded-2xl bg-[#0a0a0a] border border-[#33ff33]/30 flex flex-col items-center justify-center group overflow-hidden shadow-inner">
             {/* Glow effect */}
             <div className="absolute inset-0 bg-[#33ff33]/5 blur-3xl rounded-full" />
             
             {/* Shiny effect */}
             {pet.isShiny && (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] animate-pulse" />
             )}

             <motion.div 
               animate={{ 
                 y: [0, -10, 0],
                 scale: [1, 1.05, 1],
                 rotate: pet.fatigue > 80 ? [0, -2, 2, 0] : 0
               }}
               transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
               className="text-[120px] drop-shadow-[0_0_30px_rgba(51,255,51,0.4)] relative z-10"
             >
               {currentSpecies.icon}
             </motion.div>

             <div className="text-center mt-4 relative z-10">
               <h2 className={cn(
                 "text-xl font-bold uppercase tracking-[0.2em]",
                 pet.isShiny && "text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]"
               )}>
                 {pet.name}
               </h2>
               <div className="text-[10px] text-[#33ff33]/60 font-black mt-1">
                 LV.{pet.level} {currentSpecies.rarity.toUpperCase()} SPECIMEN
               </div>
             </div>

             {/* XP Bar */}
             <div className="absolute bottom-6 left-6 right-6 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${(pet.xp / (pet.level * 100)) * 100}%` }}
                 className="h-full bg-[#33ff33] shadow-[0_0_10px_#33ff33]"
               />
             </div>
          </div>

          <div className="p-4 bg-[#1a1a1a] rounded-xl border border-[#33ff33]/10">
             <div className="text-[10px] font-bold text-[#33ff33]/40 mb-3 uppercase tracking-widest">属性状态 (ATTRIBUTES)</div>
             <div className="space-y-3">
               {(Object.entries(pet.attributes) as [AttributeKey, number][]).map(([key, val]) => {
                  const Icon = attributeIcons[key];
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5 opacity-80">
                          <Icon className="w-3 h-3" />
                          {attributeLabels[key]}
                        </div>
                        <span className="font-bold">{val} Pts</span>
                      </div>
                      <div className="h-1.5 bg-[#0c0c0c] rounded-full overflow-hidden">
                         <div 
                           className="h-full bg-[#33ff33]/50" 
                           style={{ width: `${Math.min(100, (val / (pet.level * 20)) * 100)}%` }} 
                         />
                      </div>
                    </div>
                  );
               })}
             </div>
          </div>
        </div>

        {/* Right: History & Actions */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="flex-1 bg-[#0a0a0a] rounded-2xl border border-[#33ff33]/20 p-4 font-mono text-xs overflow-y-auto space-y-2 relative shadow-inner scrollbar-thin scrollbar-thumb-[#33ff33]/20">
             <div className="text-[10px] font-bold text-[#33ff33]/30 sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-sm py-1">CONSOLE_LOG &gt;_</div>
             <AnimatePresence mode="popLayout">
               {pet.history.map((log, i) => (
                 <motion.div 
                   key={i}
                   initial={{ opacity: 0, x: -10 }}
                   animate={{ opacity: 1, x: 0 }}
                   className={cn(
                     "whitespace-pre-wrap leading-relaxed",
                     log.includes('[LEVEL UP]') ? "text-yellow-400 font-bold" :
                     log.includes('[ERROR]') ? "text-red-500" :
                     log.includes('[ACTION]') ? "text-[#33ff33]" : "text-[#33ff33]/50"
                   )}
                 >
                   {log}
                 </motion.div>
               ))}
             </AnimatePresence>
             <form onSubmit={handleCommand} className="sticky bottom-0 bg-[#0a0a0a]/90 backdrop-blur-sm pt-4 flex items-center gap-2 border-t border-[#33ff33]/10 mt-4">
               <span className="text-[#33ff33] animate-pulse">$</span>
               <input 
                 type="text" 
                 value={command}
                 onChange={(e) => setCommand(e.target.value)}
                 placeholder="Terminal CMD (/buddy, help, ls...)"
                 className="bg-transparent border-none outline-none text-[#33ff33] w-full text-[10px] placeholder:text-[#33ff33]/20 font-mono"
               />
             </form>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => action('debug')}
              className="group p-3 bg-[#1a1a1a] hover:bg-[#33ff33] hover:text-[#0c0c0c] transition-all rounded-xl border border-[#33ff33]/30 text-[10px] font-bold flex flex-col items-center gap-2"
            >
              <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
              DEBUG 测试 (XP+)
            </button>
            <button 
              onClick={() => action('refactor')}
              className="group p-3 bg-[#1a1a1a] hover:bg-[#33ff33] hover:text-[#0c0c0c] transition-all rounded-xl border border-[#33ff33]/30 text-[10px] font-bold flex flex-col items-center gap-2"
            >
              <Cpu className="w-4 h-4 group-hover:scale-110 transition-transform" />
              全工程重构 (SPD+)
            </button>
            <button 
              onClick={() => action('test')}
              className="group p-3 bg-[#1a1a1a] hover:bg-[#33ff33] hover:text-[#0c0c0c] transition-all rounded-xl border border-[#33ff33]/30 text-[10px] font-bold flex flex-col items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 group-hover:scale-110" />
              安全渗透 (DEF+)
            </button>
            <button 
              onClick={() => action('overclock')}
              className="group p-3 bg-red-950/20 text-red-500 hover:bg-red-500 hover:text-white transition-all rounded-xl border border-red-500/30 text-[10px] font-bold flex flex-col items-center gap-2"
            >
              <Zap className="w-4 h-4 group-hover:animate-bounce" />
              内核超频 (POW++)
            </button>
            <button 
              onClick={() => action('sleep')}
              className="p-3 bg-indigo-950/20 text-indigo-400 hover:bg-indigo-400 hover:text-white transition-all rounded-xl border border-indigo-400/30 text-[10px] font-bold flex flex-col items-center gap-2"
            >
              <Moon className="w-4 h-4" />
              休眠回收 (REC)
            </button>
            <button 
              onClick={summon}
              className="p-3 bg-amber-950/20 text-amber-500 hover:bg-amber-500 hover:text-white transition-all rounded-xl border border-amber-500/30 text-[10px] font-bold flex flex-col items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              格式化重置
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 bg-[#1a1a1a]/50 text-[9px] text-[#33ff33]/30 flex justify-between items-center border-t border-[#33ff33]/10">
        <div>CORE_TEMP: 38C | GLO: 0.231 | FATIGUE: {pet.fatigue}/100</div>
        <div className="flex gap-4">
           <span>{currentSpecies.description}</span>
           <span className="font-bold underline">ID: {currentSpecies.id.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
