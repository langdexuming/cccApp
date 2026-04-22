import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ProjectPhase, Task } from '../types';
import { CheckCircle2, Circle, Clock, Layout, Code2, Beaker, Rocket, Settings2, Plus, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface ProjectTimelineProps {
  currentPhase: ProjectPhase;
  tasks: Task[];
  onUpdatePhase: (phase: ProjectPhase) => void;
  onAddTask: () => void;
}

const PHASES: { id: ProjectPhase; name: string; icon: any }[] = [
  { id: 'planning', name: '需求规划', icon: Layout },
  { id: 'design', name: '架构设计', icon: Settings2 },
  { id: 'development', name: '工程开发', icon: Code2 },
  { id: 'testing', name: '质量测试', icon: Beaker },
  { id: 'deployment', name: '发布落地', icon: Rocket },
];

export function ProjectTimeline({ currentPhase, tasks, onUpdatePhase, onAddTask }: ProjectTimelineProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const currentPhaseIndex = PHASES.findIndex(p => p.id === currentPhase);

  return (
    <div className={cn(
      "mb-8 space-y-4 bg-zinc-50/50 rounded-2xl border border-zinc-100 transition-all overflow-hidden",
      isCollapsed ? "p-3" : "p-6"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 hover:bg-zinc-100 rounded-md transition-colors"
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <div>
            <h2 className="text-sm font-bold text-text-primary tracking-tight">AI Sync Lifecycle</h2>
            {!isCollapsed && <p className="text-[10px] text-text-secondary mt-0.5">End-to-end project orchestration</p>}
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          {PHASES.map((phase, idx) => {
            const Icon = phase.icon;
            const isCompleted = idx < currentPhaseIndex;
            const isActive = idx === currentPhaseIndex;

            if (isCollapsed && !isActive) return null;

            return (
              <div key={phase.id} className="flex items-center">
                <button
                  onClick={() => onUpdatePhase(phase.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-1 transition-all group",
                    isActive ? "opacity-100 scale-105" : "opacity-30 hover:opacity-50"
                  )}
                >
                  <div className={cn(
                    "p-1.5 rounded-xl transition-all shadow-sm",
                    isActive ? "bg-accent-theme text-white ring-2 ring-accent-theme/10" :
                    isCompleted ? "bg-emerald-100 text-emerald-600" : "bg-white text-zinc-400"
                  )}>
                    <Icon className={cn(isCollapsed ? "w-3 h-3" : "w-4 h-4")} />
                  </div>
                  {!isCollapsed && (
                    <span className={cn(
                      "text-[9px] font-bold whitespace-nowrap uppercase tracking-tighter",
                      isActive ? "text-accent-theme" : "text-zinc-500"
                    )}>
                      {phase.name}
                    </span>
                  )}
                </button>
                {!isCollapsed && idx < PHASES.length - 1 && (
                  <div className="mx-1 mt-[-14px]">
                    <ArrowRight className="w-2.5 h-2.5 text-zinc-200" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div className="bg-white rounded-xl p-4 border border-zinc-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-accent-theme" />
                  Tasks
                </h3>
            <button
              onClick={onAddTask}
              className="p-1 hover:bg-zinc-50 rounded-lg text-accent-theme transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {tasks.filter(t => t.phase === currentPhase).length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-[10px] text-zinc-400 italic">暂无任务，由 PM 自动分配中...</p>
              </div>
            ) : (
              tasks.filter(t => t.phase === currentPhase).map(task => (
                <div key={task.id} className="flex items-center justify-between group overflow-hidden">
                  <div className="flex items-center gap-2">
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-zinc-300 shrink-0 group-hover:text-accent-theme transition-colors" />
                    )}
                    <span className={cn(
                      "text-xs font-medium truncate max-w-[100px]",
                      task.status === 'completed' ? "text-zinc-400 line-through" : "text-text-primary"
                    )}>
                      {task.title}
                    </span>
                  </div>
                  <div className="text-[8px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-bold uppercase transition-colors group-hover:bg-accent-theme group-hover:text-white">
                    {task.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-zinc-100 shadow-sm flex flex-col justify-center items-center text-center space-y-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-1 opacity-5 group-hover:opacity-10 transition-opacity">
            <Rocket className="w-12 h-12" />
          </div>
          <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-black text-text-primary tracking-tighter">
              {Math.round((tasks.filter(t => t.status === 'completed').length / (tasks.length || 1)) * 100)}%
            </div>
            <div className="text-[9px] font-bold text-text-secondary uppercase tracking-widest mt-0.5">
              Progress
            </div>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
</div>
  );
}
