import { motion } from 'motion/react';
import { ProjectPhase, Task } from '../types';
import { CheckCircle2, Circle, Clock, Layout, Code2, Beaker, Rocket, Settings2, Plus, ArrowRight } from 'lucide-react';
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
  const currentPhaseIndex = PHASES.findIndex(p => p.id === currentPhase);

  return (
    <div className="mb-12 space-y-8 bg-zinc-50/50 rounded-3xl p-8 border border-zinc-100">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary tracking-tight">AI 协作生命周期</h2>
          <p className="text-xs text-text-secondary mt-1">从构想到落地的全流程自动跟进</p>
        </div>
        <div className="flex items-center gap-2">
          {PHASES.map((phase, idx) => {
            const Icon = phase.icon;
            const isCompleted = idx < currentPhaseIndex;
            const isActive = idx === currentPhaseIndex;

            return (
              <div key={phase.id} className="flex items-center">
                <button
                  onClick={() => onUpdatePhase(phase.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 transition-all group",
                    isActive ? "opacity-100 scale-110" : "opacity-40 hover:opacity-60"
                  )}
                >
                  <div className={cn(
                    "p-2.5 rounded-2xl transition-all shadow-sm",
                    isActive ? "bg-accent-theme text-white ring-4 ring-accent-theme/10" :
                    isCompleted ? "bg-emerald-100 text-emerald-600" : "bg-white text-zinc-400"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold whitespace-nowrap uppercase tracking-tighter",
                    isActive ? "text-accent-theme" : "text-zinc-500"
                  )}>
                    {phase.name}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute -bottom-1 w-1 h-1 rounded-full bg-accent-theme"
                    />
                  )}
                </button>
                {idx < PHASES.length - 1 && (
                  <div className="mx-2 mt-[-18px]">
                    <ArrowRight className="w-3 h-3 text-zinc-200" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-3 h-3 text-accent-theme" />
              当前阶段任务流
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
                  <div className="flex items-center gap-3">
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-zinc-300 shrink-0 group-hover:text-accent-theme transition-colors" />
                    )}
                    <span className={cn(
                      "text-xs font-medium truncate max-w-[120px]",
                      task.status === 'completed' ? "text-zinc-400 line-through" : "text-text-primary"
                    )}>
                      {task.title}
                    </span>
                  </div>
                  <div className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-bold uppercase transition-colors group-hover:bg-accent-theme group-hover:text-white">
                    {task.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm flex flex-col justify-center items-center text-center space-y-3 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
            <Rocket className="w-20 h-20" />
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xl font-black text-text-primary tracking-tighter">
              {Math.round((tasks.filter(t => t.status === 'completed').length / (tasks.length || 1)) * 100)}%
            </div>
            <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mt-1">
              整体落地进度
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
