import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Heart, Coffee, Moon, Sun } from 'lucide-react';
import { cn } from '../lib/utils';

interface PetProps {
  isTyping?: boolean;
}

export function Pet({ isTyping }: PetProps) {
  const [mood, setMood] = useState<'happy' | 'sleepy' | 'hungry' | 'playful' | 'thinking'>('happy');
  const [isInteracting, setIsInteracting] = useState(false);
  const [message, setMessage] = useState('你好！我是你的 AI 宠物伙伴。');
  const [energy, setEnergy] = useState(100);

  const messages = {
    happy: ['今天心情真不错！', '我们要开始工作了吗？', '看到你真开心！'],
    sleepy: ['呜...好困啊...', '我想打个盹...', 'Zzz...'],
    hungry: ['肚子有点饿了...', '有小零食吗？', '想吃好吃的！'],
    playful: ['来玩吧！', '嘿嘿，看我！', '我们要去哪儿玩？'],
    thinking: ['AI 正在思考中...', '嘘...它在努力工作呢！', '我也在帮你加油哦！']
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setEnergy(prev => Math.max(0, prev - 1));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isTyping) {
      setMood('thinking');
      setMessage(messages.thinking[Math.floor(Math.random() * messages.thinking.length)]);
    } else {
      if (energy < 20) setMood('sleepy');
      else if (energy < 50) setMood('hungry');
      else if (isInteracting) setMood('playful');
      else setMood('happy');
    }
  }, [energy, isInteracting, isTyping]);

  const handleInteract = () => {
    setIsInteracting(true);
    setEnergy(prev => Math.min(100, prev + 10));
    const randomMsg = messages[mood][Math.floor(Math.random() * messages[mood].length)];
    setMessage(randomMsg);
    setTimeout(() => setIsInteracting(false), 2000);
  };

  return (
    <div className="p-4 bg-white/50 rounded-xl border border-border-theme/50 m-3 relative overflow-hidden group">
      <div className="flex items-center gap-3">
        <div className="relative cursor-pointer" onClick={handleInteract}>
          <motion.div
            animate={isInteracting ? {
              scale: [1, 1.2, 1],
              rotate: [0, 10, -10, 0]
            } : mood === 'sleepy' ? {
              y: [0, 2, 0]
            } : {
              y: [0, -2, 0]
            }}
            transition={{ duration: 0.5, repeat: mood === 'sleepy' ? Infinity : 0 }}
            className="text-4xl"
          >
            {mood === 'happy' && '🐱'}
            {mood === 'sleepy' && '😴'}
            {mood === 'hungry' && '😿'}
            {mood === 'playful' && '😺'}
            {mood === 'thinking' && '🤔'}
          </motion.div>
          
          <AnimatePresence>
            {isInteracting && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                className="absolute -top-2 -right-2 text-red-500"
              >
                <Heart className="w-4 h-4 fill-current" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-tighter">AI 伙伴</span>
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    i < energy / 20 ? "bg-accent-theme" : "bg-zinc-200"
                  )} 
                />
              ))}
            </div>
          </div>
          <p className="text-[11px] text-text-primary leading-tight truncate">
            {message}
          </p>
        </div>
      </div>

      {/* Abilities Overlay */}
      <div className="absolute inset-0 bg-accent-theme/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <div className="mt-3 flex gap-2">
        <button 
          onClick={handleInteract}
          className="flex-1 py-1 bg-white border border-border-theme rounded-md text-[10px] font-medium hover:bg-zinc-50 transition-colors flex items-center justify-center gap-1"
        >
          <Sparkles className="w-3 h-3 text-orange-400" />
          互动
        </button>
        <button 
          onClick={() => {
            setEnergy(100);
            setMessage('哇！好饱啊，谢谢你！');
          }}
          className="flex-1 py-1 bg-white border border-border-theme rounded-md text-[10px] font-medium hover:bg-zinc-50 transition-colors flex items-center justify-center gap-1"
        >
          <Coffee className="w-3 h-3 text-brown-500" />
          喂食
        </button>
      </div>
    </div>
  );
}
