import { motion, AnimatePresence } from 'motion/react';
import { Cat, Dog, Bird, Ghost, Sparkles, MessageSquare } from 'lucide-react';
import { useState, useEffect } from 'react';

type PetMood = 'happy' | 'worried' | 'dreaming' | 'idle';

interface ProjectPetProps {
  score: number; // Overall maintainability score
  isDreaming: boolean;
}

export function ProjectPet({ score, isDreaming }: ProjectPetProps) {
  const [mood, setMood] = useState<PetMood>('idle');
  const [quote, setQuote] = useState<string>('我会一直盯着你的代码...');

  useEffect(() => {
    if (isDreaming) {
      setMood('dreaming');
      setQuote('我在梦中看到了这个项目的未来...');
    } else if (score > 85) {
      setMood('happy');
      setQuote('代码非常优雅，我是指，它闻起来很像主人的味道。');
    } else if (score < 60) {
      setMood('worried');
      setQuote('技术债堆积如山，我有点睡不着觉...汪！');
    } else {
      setMood('idle');
      setQuote('正在待命，随时准备分析。');
    }
  }, [score, isDreaming]);

  const moodIcons = {
    happy: <Dog className="w-10 h-10 text-emerald-500" />,
    worried: <Cat className="w-10 h-10 text-amber-500" />,
    dreaming: <Ghost className="w-10 h-10 text-indigo-500" />,
    idle: <Bird className="w-10 h-10 text-zinc-400" />,
  };

  return (
    <div className="relative group p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-center gap-4">
      <motion.div
        animate={mood === 'dreaming' ? {
          y: [0, -5, 0],
          rotate: [0, 5, -5, 0],
          scale: [1, 1.1, 1],
        } : {
          y: [0, -2, 0],
        }}
        transition={{ duration: mood === 'dreaming' ? 3 : 2, repeat: Infinity }}
        className="relative"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={mood}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
          >
            {moodIcons[mood]}
          </motion.div>
        </AnimatePresence>
        
        {mood === 'dreaming' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute -top-1 -right-1"
          >
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
          </motion.div>
        )}
      </motion.div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">分析助手使魔</span>
          {mood === 'happy' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
        </div>
        <div className="text-xs font-medium text-text-primary leading-tight mt-1">
          "{quote}"
        </div>
      </div>

      <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="bg-white px-2 py-1 rounded-lg shadow-sm border border-zinc-100 text-[10px] font-bold text-accent-theme">
          Lv. 12 使魔
        </div>
      </div>
    </div>
  );
}
