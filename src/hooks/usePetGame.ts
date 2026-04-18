import { useState, useEffect } from 'react';

export type AttributeKey = 'logic' | 'power' | 'security' | 'speed' | 'luck';

export interface PetAttributes {
  logic: number;
  power: number;
  security: number;
  speed: number;
  luck: number;
}

export interface PetSpecies {
  id: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  description: string;
  icon: string;
}

export const SPECIES: PetSpecies[] = [
  { id: 'slime', name: 'Binary Slime', rarity: 'common', description: '010101... 看起来非常基础。', icon: '💧' },
  { id: 'pixie', name: 'Syntax Pixie', rarity: 'common', description: '喜欢在代码行间跳舞的精灵。', icon: '🧚' },
  { id: 'imp', name: 'Indentation Imp', rarity: 'common', description: '总是纠结于 Tab 还是 Space。', icon: '😈' },
  { id: 'crow', name: 'Compiler Crow', rarity: 'common', description: '盯着你的警告信息。', icon: '🐦' },
  { id: 'golem', name: 'Null Pointer Golem', rarity: 'uncommon', description: '沉默寡言，容易迷失自我。', icon: '🗿' },
  { id: 'hound', name: 'Regex Hound', rarity: 'uncommon', description: '嗅觉灵敏，能匹配任何模式。', icon: '🐕' },
  { id: 'architect', name: 'Class Architect', rarity: 'uncommon', description: '非常有组织，喜欢多级继承。', icon: '🎓' },
  { id: 'mimic', name: 'Middleware Mimic', rarity: 'uncommon', description: '能模仿任何 Request。', icon: '📦' },
  { id: 'phoenix', name: 'Recursive Phoenix', rarity: 'rare', description: '在函数调用栈中永生。', icon: '🔥' },
  { id: 'drake', name: 'Database Drake', rarity: 'rare', description: '守护着庞大索引的巨龙。', icon: '🐲' },
  { id: 'siren', name: 'Async Siren', rarity: 'rare', description: '它的歌声让你陷入 await 循环。', icon: '🧜' },
  { id: 'titan', name: 'Threading Titan', rarity: 'rare', description: '同时处理多条时间线的巨神。', icon: '🦾' },
  { id: 'paladin', name: 'Security Paladin', rarity: 'epic', description: '无懈可击的防火墙守护者。', icon: '🛡️' },
  { id: 'oracle', name: 'Optimization Oracle', rarity: 'epic', description: '能预见最优化的运行路径。', icon: '👁️' },
  { id: 'collector', name: 'Garbage Collector', rarity: 'epic', description: '默默清理项目中的废弃内存。', icon: '🧹' },
  { id: 'king', name: 'Kernel King', rarity: 'legendary', description: '操作系统的至高无上者。', icon: '👑' },
  { id: 'core', name: 'Singularity Core', rarity: 'mythic', description: '超越图灵机概念的终极意志。', icon: '🌀' },
  { id: 'glitch', name: 'Glitch God', rarity: 'mythic', description: '存在于代码裂缝中的概率奇迹。', icon: '✨' },
];

export interface PetState {
  speciesId: string;
  name: string;
  level: number;
  xp: number;
  fatigue: number;
  attributes: PetAttributes;
  isShiny: boolean;
  history: string[];
}

const INITIAL_PET: PetState = {
  speciesId: 'slime',
  name: '小二进制',
  level: 1,
  xp: 0,
  fatigue: 0,
  isShiny: false,
  attributes: {
    logic: 10,
    power: 10,
    security: 10,
    speed: 10,
    luck: 10,
  },
  history: ['[SYSTEM] 初次实例化完成。'],
};

export function usePetGame() {
  const [pet, setPet] = useState<PetState>(() => {
    const saved = localStorage.getItem('project_analyst_pet');
    return saved ? JSON.parse(saved) : INITIAL_PET;
  });

  useEffect(() => {
    localStorage.setItem('project_analyst_pet', JSON.stringify(pet));
  }, [pet]);

  const addLog = (msg: string) => {
    setPet(prev => ({
      ...prev,
      history: [msg, ...prev.history].slice(0, 50)
    }));
  };

  const action = (type: 'debug' | 'refactor' | 'overclock' | 'test' | 'sleep') => {
    if (pet.fatigue >= 100 && type !== 'sleep') {
      addLog('[ERROR] 疲劳值过高，宠物需要休息。');
      return;
    }

    setPet(prev => {
      const next = { ...prev };
      let xpGain = 10;
      let fatigueGain = 20;

      switch (type) {
        case 'debug':
          next.attributes.logic += 2;
          addLog(`[ACTION] 进行 DEBUG... Logic +2`);
          break;
        case 'refactor':
          next.attributes.speed += 2;
          addLog(`[ACTION] 正在重构... Speed +2`);
          break;
        case 'overclock':
          next.attributes.power += 5;
          fatigueGain = 40;
          addLog(`[ACTION] 超频成功！Power +5, 感到很累。`);
          break;
        case 'test':
          next.attributes.security += 2;
          addLog(`[ACTION] 执行测试... Security +2`);
          break;
        case 'sleep':
          next.fatigue = Math.max(0, next.fatigue - 60);
          addLog(`[ACTION] 正在通过睡眠回收内存... 疲劳度减少`);
          return next;
      }

      next.xp += xpGain;
      next.fatigue += fatigueGain;

      // Level up logic
      if (next.xp >= next.level * 100) {
        next.level += 1;
        next.xp = 0;
        addLog(`[LEVEL UP] 升级完成！当前等级: ${next.level}`);
        
        // Evolve chance?
        if (next.level % 5 === 0) {
          const currentIdx = SPECIES.findIndex(s => s.id === next.speciesId);
          if (currentIdx < SPECIES.length - 2) {
            next.speciesId = SPECIES[currentIdx + 1].id;
            addLog(`[EVOLVE] 进化！你的使魔变态为 ${SPECIES[currentIdx+1].name}`);
          }
        }
      }

      return next;
    });
  };

  const summon = () => {
    const isShiny = Math.random() < 0.05; // 5% shiny chance
    const rand = Math.random();
    let species;
    
    if (rand < 0.01) species = SPECIES.find(s => s.rarity === 'mythic');
    else if (rand < 0.05) species = SPECIES.find(s => s.rarity === 'legendary');
    else if (rand < 0.15) species = SPECIES.find(s => s.rarity === 'epic');
    else if (rand < 0.35) species = SPECIES.find(s => s.rarity === 'rare');
    else if (rand < 0.65) species = SPECIES.find(s => s.rarity === 'uncommon');
    else species = SPECIES.find(s => s.rarity === 'common');

    const luckySpecies = species || SPECIES[0];

    const newPet: PetState = {
      ...INITIAL_PET,
      speciesId: luckySpecies.id,
      isShiny,
      name: isShiny ? `✨闪光 ${luckySpecies.name}` : luckySpecies.name,
      history: [`[SYSTEM] 召唤成功！获得 ${luckySpecies.name}${isShiny ? ' (闪光级!)' : ''}`]
    };

    setPet(newPet);
  };

  return { pet, action, summon };
}
