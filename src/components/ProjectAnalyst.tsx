import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Lightbulb, ChevronRight, AlertCircle, TrendingUp, Cpu, ShieldCheck, Loader2, X, RefreshCw, Sparkles, Rocket, FileCode, CheckCircle2, 
  Search, Zap, Globe, FileText, Download, Milestone, Calendar, Moon, MessageSquare, Brain, Activity, Mic, Share2, Terminal,
  MousePointer2, Sliders, Type, Palette, PenTool, Layers, ExternalLink, Box, Palette as BrandIcon, Package
} from 'lucide-react';
import { getProjectInsights, getInsightFix, generateProjectDocs, runPreflightChecks, generateDeploymentConfig, applyInsightFix, getProjectRoadmap, getProjectDreams, getCoordinatorPlan, runUltraplan, getKairosLogs, PreflightCheck, DeploymentFile, RoadmapItem, ProjectDream, CoordinatorPlan, KairosLog } from '../services/analysisService';
import { ProjectPet } from './ProjectPet';
import { TerminalPet } from './TerminalPet';
import { cn } from '../lib/utils';
import { AppSettings, ProjectInsight, AnalysisProvider, AnalysisResult } from '../types';
import { ProjectGraph } from './ProjectGraph';
import { ProjectRadar } from './ProjectRadar';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ProjectAnalystProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings['analysis'];
  allProviders: AppSettings['providers'];
  onUpdateSettings: (settings: AppSettings['analysis']) => void;
  isEmbedded?: boolean;
}

export function ProjectAnalyst({ 
  isOpen, 
  onClose, 
  settings, 
  allProviders, 
  onUpdateSettings,
  isEmbedded 
}: ProjectAnalystProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'insights' | 'graph' | 'roadmap' | 'docs' | 'landing' | 'lab' | 'coordinator' | 'kairos'>('insights');
  const [patchData, setPatchData] = useState<{ id: string; file: string; patch: string; explanation: string } | null>(null);
  const [isPatching, setIsPatching] = useState<string | null>(null);
  const [isApplyingFix, setIsApplyingFix] = useState(false);
  const [docs, setDocs] = useState<string | null>(null);
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false);
  const [preflightResults, setPreflightResults] = useState<PreflightCheck[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [deploymentFiles, setDeploymentFiles] = useState<DeploymentFile[]>([]);
  const [isGeneratingDeploy, setIsGeneratingDeploy] = useState(false);
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [isDreamMode, setIsDreamMode] = useState(false);
  const [dreams, setDreams] = useState<ProjectDream[]>([]);
  const [isDreaming, setIsDreaming] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  
  // New Next-Gen States
  const [coordinatorPlan, setCoordinatorPlan] = useState<CoordinatorPlan | null>(null);
  const [isCoordinating, setIsCoordinating] = useState(false);
  const [kairosLogs, setKairosLogs] = useState<KairosLog[]>([]);
  const [lastPatrol, setLastPatrol] = useState<string | null>(null);
  const [ultraplanResult, setUltraplanResult] = useState<string | null>(null);
  const [isUltraplanning, setIsUltraplanning] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  
  // Interactive Canvas States (Claude Design Style)
  const [activeTool, setActiveTool] = useState<'inspect' | 'comment' | 'edit' | 'draw' | 'tweaks' | null>(null);
  const [isTweaksPanelOpen, setIsTweaksPanelOpen] = useState(false);
  const [canvasTweaks, setCanvasTweaks] = useState({
    primaryColor: '#D97757',
    borderRadius: 12,
    fontSize: 14,
    spacing: 16
  });
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [isHandoverMode, setIsHandoverMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Handlers for New Features ---
  const handleCoordinator = async (goal: string) => {
    setIsCoordinating(true);
    const providerConfig = allProviders[settings.provider];
    const plan = await getCoordinatorPlan(settings.provider, providerConfig, goal);
    setCoordinatorPlan(plan);
    setIsCoordinating(false);
  };

  const handleUltraplan = async (topic: string) => {
    setIsUltraplanning(true);
    setUltraplanResult(null);
    const providerConfig = allProviders[settings.provider];
    const result = await runUltraplan(settings.provider, providerConfig, topic);
    setUltraplanResult(result);
    setIsUltraplanning(false);
  };

  const fetchKairos = async () => {
    const data = await getKairosLogs();
    setKairosLogs(data.logs);
    setLastPatrol(data.lastPatrol);
  };

  const toggleVoiceMode = () => {
    if (!isVoiceActive) {
      // Mock Speech API
      const synth = window.speechSynthesis;
      const utter = new SpeechSynthesisUtterance("KAIROS Voice Mode Activated. Ready for hands-free analysis.");
      synth.speak(utter);
      setIsVoiceActive(true);
    } else {
      setIsVoiceActive(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'kairos') {
      fetchKairos();
      const interval = setInterval(fetchKairos, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const fetchInsights = async (provider: AnalysisProvider = settings.provider) => {
    setIsLoading(true);
    setPatchData(null);
    setDocs(null);
    setPreflightResults([]);
    const providerConfig = allProviders[provider];
    const result = await getProjectInsights(provider, providerConfig);
    setAnalysis(result);
    setIsLoading(false);
  };

  const handleRunPreflight = async () => {
    setIsChecking(true);
    const providerConfig = allProviders[settings.provider];
    const results = await runPreflightChecks(settings.provider, providerConfig);
    setPreflightResults(results);
    setIsChecking(false);
  };

  const handleGenerateDocs = async () => {
    setIsGeneratingDocs(true);
    const providerConfig = allProviders[settings.provider];
    const content = await generateProjectDocs(settings.provider, providerConfig);
    setDocs(content);
    setIsGeneratingDocs(false);
  };

  const handleApplyFix = async (insight: ProjectInsight) => {
    setIsPatching(insight.id);
    const providerConfig = allProviders[settings.provider];
    const result = await getInsightFix(settings.provider, providerConfig, insight);
    if (result) {
      setPatchData({ ...result, id: insight.id });
    }
    setIsPatching(null);
  };

  const handleGenerateDeploy = async (type: 'docker' | 'github-actions') => {
    setIsGeneratingDeploy(true);
    setDeploymentFiles([]);
    const providerConfig = allProviders[settings.provider];
    const files = await generateDeploymentConfig(settings.provider, providerConfig, type);
    setDeploymentFiles(files);
    setIsGeneratingDeploy(false);
  };

  const handleGenerateRoadmap = async () => {
    setIsGeneratingRoadmap(true);
    const providerConfig = allProviders[settings.provider];
    const items = await getProjectRoadmap(settings.provider, providerConfig);
    setRoadmap(items);
    setIsGeneratingRoadmap(false);
  };

  const handleConfirmApply = async () => {
    if (!patchData) return;
    setIsApplyingFix(true);
    try {
      await applyInsightFix(patchData.file, patchData.patch);
      setApplySuccess(`已成功应用修复到 ${patchData.file}`);
      setTimeout(() => setApplySuccess(null), 3000);
      setPatchData(null);
      // Re-scan to update insights
      fetchInsights();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsApplyingFix(false);
    }
  };

  const toggleDreamMode = async () => {
    if (!isDreamMode) {
      setIsDreamMode(true);
      setIsDreaming(true);
      const providerConfig = allProviders[settings.provider];
      const result = await getProjectDreams(settings.provider, providerConfig);
      setDreams(result);
      setIsDreaming(false);
    } else {
      setIsDreamMode(false);
      setDreams([]);
    }
  };

  const handleDiscussWithAI = (insight: ProjectInsight) => {
    const prompt = `嘿！我正在查看项目的 AI 分析报告，其中一条建议是关于“${insight.title}”的（优先级：${insight.priority}）。
具体描述：${insight.description}
AI 建议：${insight.suggestion}

你能帮我深入分析一下如果我要实施这个方案，具体的代码实现步骤是什么？有没有什么潜在的坑需要注意？`;
    navigator.clipboard.writeText(prompt);
    setCopiedMsg("讨论指令已复制！请直接粘贴发送给 AI 伙伴。");
    setTimeout(() => setCopiedMsg(null), 3000);
  };

  const handleDiscussDream = (dream: ProjectDream) => {
    const prompt = `我对这个“技术梦境”非常感兴趣：【${dream.topic}】
愿景描述：${dream.vision}
颠覆性影响：${dream.impact}

作为一个前瞻性的技术专家，我想探讨一下这个幻觉在当前项目中落地的可能性。我们该如何从现在的架构一步步演进过去？有哪些实验性的库或框架可以开始小规模尝试？`;
    navigator.clipboard.writeText(prompt);
    setCopiedMsg("梦境探讨指令已复制！请直接粘贴发送给 AI 伙伴。");
    setTimeout(() => setCopiedMsg(null), 3000);
  };

  const handleExportReport = () => {
    if (!analysis) return;
    const report = {
      timestamp: new Date().toISOString(),
      analysis,
      docs,
      preflightResults,
      deploymentFiles
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-analysis-report-${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (isOpen && settings.autoScan) {
      fetchInsights();
    }
  }, [isOpen, settings.autoScan]);

  const categoryIcons = {
    architecture: <Cpu className="w-4 h-4" />,
    performance: <TrendingUp className="w-4 h-4" />,
    security: <ShieldCheck className="w-4 h-4" />,
    trends: <Lightbulb className="w-4 h-4" />,
  };

  const priorityColors = {
    low: "bg-blue-100 text-blue-700",
    medium: "bg-amber-100 text-amber-700",
    high: "bg-red-100 text-red-700",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={cn(
          isEmbedded ? "relative w-full h-full flex flex-col" : "fixed inset-0 z-[100] flex items-center justify-center p-4"
        )}>
          {!isEmbedded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
          )}
          <motion.div
            initial={isEmbedded ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={isEmbedded ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }}
            className={cn(
              "relative bg-bg-canvas flex flex-col overflow-hidden",
              isEmbedded ? "w-full h-full" : "w-full max-w-2xl rounded-3xl shadow-2xl max-h-[80vh]"
            )}
          >
            {/* Header */}
            <div className={cn(
              "px-6 pt-4 border-b border-border-theme flex flex-col transition-all",
              isEmbedded ? "bg-bg-canvas" : "bg-zinc-50/50"
            )}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-accent-theme/5 rounded-lg border border-accent-theme/10">
                    <Sparkles className="w-4 h-4 text-accent-theme" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-text-primary tracking-tight uppercase">设计与分析</h2>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Design Tools (Claude Style) */}
                  <div className="flex items-center gap-0.5 bg-zinc-100/80 p-0.5 rounded-lg mr-2 border border-border-theme/50">
                    {[
                      { id: 'inspect', icon: MousePointer2, label: '检查' },
                      { id: 'comment', icon: MessageSquare, label: '评论' },
                      { id: 'edit', icon: Type, label: '直接编辑' },
                      { id: 'draw', icon: PenTool, label: '手绘标注' },
                      { id: 'tweaks', icon: Sliders, label: '调节' },
                    ].map((tool) => (
                      <button
                        key={tool.id}
                        onClick={() => {
                          setActiveTool(activeTool === tool.id ? null : tool.id as any);
                          if (tool.id === 'tweaks') setIsTweaksPanelOpen(!isTweaksPanelOpen);
                        }}
                        className={cn(
                          "p-1.5 rounded-md transition-all",
                          activeTool === tool.id 
                            ? "bg-white text-accent-theme shadow-sm" 
                            : "text-zinc-400 hover:text-text-primary hover:bg-white/50"
                        )}
                        title={tool.label}
                      >
                        <tool.icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>

                  <button 
                    onClick={() => fetchInsights()}
                    disabled={isLoading}
                    className="p-1.5 hover:bg-zinc-200 rounded-lg text-text-secondary disabled:opacity-50"
                    title="重新扫描项目"
                  >
                    <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                  </button>
                  <button 
                    onClick={toggleDreamMode}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      isDreamMode ? "bg-indigo-600 text-white" : "hover:bg-zinc-200 text-text-secondary"
                    )}
                    title="梦想模式"
                  >
                    <Moon className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-border-theme mx-1" />
                  {!isEmbedded && (
                    <button 
                      onClick={onClose}
                      className="p-1.5 hover:bg-zinc-200 rounded-lg text-text-secondary"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs & Provider Selector */}
              <div className="flex items-center justify-between border-b border-zinc-100 -mx-6 px-6">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {(['insights', 'graph', 'roadmap', 'docs', 'coordinator', 'kairos', 'lab'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                         setActiveTab(tab);
                         if (tab === 'docs' && !docs) handleGenerateDocs();
                      }}
                      className={cn(
                        "px-3 py-2 text-[11px] font-bold transition-all border-b-2 whitespace-nowrap",
                        activeTab === tab 
                          ? "border-accent-theme text-text-primary" 
                          : "border-transparent text-text-secondary hover:text-text-primary"
                      )}
                    >
                      {tab === 'insights' ? '建议' : 
                       tab === 'graph' ? '图谱' :
                       tab === 'roadmap' ? '路线' :
                       tab === 'docs' ? '文档' :
                       tab === 'coordinator' ? '协调' :
                       tab === 'kairos' ? '巡逻' : '实验'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 mb-1">
                  <button
                    onClick={() => setIsHandoverMode(true)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-accent-theme text-white rounded-lg text-[10px] font-bold shadow-lg shadow-accent-theme/20 hover:scale-105 active:scale-95 transition-all"
                  >
                    <Rocket className="w-3 h-3" />
                    交付 CODE
                  </button>
                  <div className="flex items-center gap-1 bg-zinc-100/50 p-0.5 rounded-lg">
                  {(['gemini', 'openai'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => {
                        onUpdateSettings({ ...settings, provider: p });
                        fetchInsights(p);
                      }}
                      className={cn(
                        "px-2 py-1 text-[9px] font-bold rounded-md transition-all",
                        settings.provider === p ? "bg-white text-text-primary shadow-sm" : "text-text-secondary"
                      )}
                    >
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

            {/* Content Area with Interactive Layers */}
            <div className="flex-1 flex overflow-hidden relative">
              <div className="flex-1 overflow-y-auto p-8 relative scrollbar-none">
                {/* Hand-drawn Overlay (Mocking the logic) */}
                {activeTool === 'draw' && (
                  <div className="absolute inset-0 z-50 cursor-crosshair overflow-hidden pointer-events-auto bg-accent-theme/[0.02]">
                    <svg className="w-full h-full">
                      {/* Simple illustration of hand-drawn marks */}
                      <path d="M100 100 Q 150 50 200 100 T 300 100" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-theme/40" />
                      <circle cx="400" cy="200" r="40" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="text-indigo-400/50" />
                    </svg>
                  </div>
                )}

                {/* Inline Comment Mode Indicators */}
                {activeTool === 'comment' && (
                  <div className="absolute inset-0 z-40 bg-zinc-900/[0.02] cursor-help" />
                )}

                <AnimatePresence>
                  {isDreamMode && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/10 via-purple-900/5 to-transparent" />
                    <div className="absolute top-0 left-0 w-full h-full opacity-30 mix-blend-overlay atmosphere" 
                         style={{ 
                           background: 'radial-gradient(circle at 50% 30%, rgba(79, 70, 229, 0.4) 0%, transparent 60%), radial-gradient(circle at 10% 80%, rgba(217, 119, 87, 0.3) 0%, transparent 50%)',
                           filter: 'blur(60px)'
                         }} 
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative z-10 space-y-8">
                {/* Ultraplan Results Overlay */}
                <AnimatePresence>
                  {isUltraplanning && (
                    <motion.div 
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl p-6 flex items-center justify-between backdrop-blur-md"
                    >
                      <div className="flex items-center gap-4">
                        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                        <div>
                          <p className="text-sm font-bold text-indigo-900 leading-none">Ultraplan 云端深度规划中</p>
                          <p className="text-[10px] text-indigo-700/60 mt-1">正在调度 Pro 1.5 系列模型进行长程战略推演...</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {ultraplanResult && !isUltraplanning && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-indigo-950 text-indigo-100 rounded-3xl p-8 border border-indigo-500/30 shadow-2xl relative group"
                    >
                      <button 
                        onClick={() => setUltraplanResult(null)}
                        className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-3 mb-6">
                        <Brain className="w-6 h-6 text-indigo-400" />
                        <h3 className="text-lg font-black tracking-widest uppercase">ULTRAPLAN_STRATEGIC_REPORT</h3>
                      </div>
                      <div className="prose prose-sm prose-invert max-w-none text-zinc-300 leading-relaxed font-serif">
                        <Markdown remarkPlugins={[remarkGfm]}>{ultraplanResult}</Markdown>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Pet Display */}
                <ProjectPet 
                  score={analysis?.radar.maintainability || 75} 
                  isDreaming={isDreamMode} 
                />

                {isDreamMode ? (
                  <div className="space-y-8 pb-10">
                    <div className="flex items-center gap-4 border-l-4 border-indigo-500 pl-4 py-2 bg-indigo-50/50 rounded-r-2xl">
                       <Zap className="w-6 h-6 text-indigo-600" />
                       <div>
                         <h3 className="text-lg font-black text-indigo-950 uppercase italic tracking-tighter">开发者梦境：技术演进幻觉</h3>
                         <p className="text-xs text-indigo-800/70 font-bold">这里的每一个想法都可能在 2026 年改变您的项目架构</p>
                       </div>
                    </div>

                    {isDreaming ? (
                      <div className="py-20 flex flex-col items-center justify-center space-y-6">
                         <div className="relative">
                           <Moon className="w-12 h-12 text-indigo-500 animate-bounce" />
                           <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-amber-400 animate-pulse" />
                         </div>
                         <p className="text-sm font-serif italic text-indigo-900/60 animate-pulse">正在从神经网络的裂缝中捕捉灵感...</p>
                      </div>
                    ) : (
                      <div className="grid gap-6">
                        {dreams.map((dream, idx) => (
                          <motion.div
                            key={dream.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.2 }}
                            className="group relative p-8 rounded-[40px] bg-white border border-indigo-100 shadow-xl shadow-indigo-900/5 hover:-translate-y-2 transition-all duration-500 overflow-hidden"
                          >
                            <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-indigo-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10 flex flex-col h-full">
                              <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-3 py-1 bg-indigo-50 rounded-full">Visionary Shift</span>
                                <div className="text-right">
                                  <div className="text-[10px] font-bold text-zinc-400">幻觉可实现率</div>
                                  <div className="text-xs font-black text-indigo-600">{dream.probability}%</div>
                                </div>
                              </div>
                              <h4 className="text-2xl font-serif italic font-black text-indigo-950 mb-4 group-hover:text-accent-theme transition-colors">{dream.topic}</h4>
                              <p className="text-sm text-indigo-900/70 leading-relaxed font-medium mb-6">"{dream.vision}"</p>
                              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex gap-4 items-start mb-6">
                                <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-1" />
                                <div>
                                  <div className="text-[10px] font-black text-zinc-400 uppercase">颠覆性影响</div>
                                  <div className="text-xs text-text-primary font-bold mt-0.5">{dream.impact}</div>
                                </div>
                              </div>
                              <div className="mt-auto">
                                <button 
                                  onClick={() => handleDiscussDream(dream)}
                                  className="w-full py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  深入探讨该幻觉
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                  {activeTab === 'insights' ? (
                <div className="space-y-6">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                      <div className="relative">
                        <Loader2 className="w-12 h-12 text-accent-theme animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Search className="w-4 h-4 text-accent-theme opacity-50" />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-text-primary italic animate-pulse">正在连接 Google Search 感知 2024/2025 最新技术趋势...</p>
                        <p className="text-xs text-text-secondary mt-1">深度扫描项目架构并对比全球最佳实践</p>
                      </div>
                    </div>
                  ) : analysis ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                        <ProjectRadar scores={analysis.radar} />
                        <div className="p-6 rounded-3xl border border-border-theme bg-zinc-50/50 flex flex-col justify-center">
                          <h4 className="text-xs font-black text-text-secondary uppercase tracking-widest mb-2">项目 AI 综述</h4>
                          <p className="text-sm text-text-primary font-medium leading-relaxed">
                            {analysis.context.summary}
                          </p>
                          <div className="mt-4 pt-4 border-t border-zinc-200">
                             <div className="flex items-center gap-2 text-[10px] text-text-secondary font-bold">
                               <FileCode className="w-3 h-3" />
                               扫描范围: {analysis.context.tree.length} 个根节点 / 核心业务逻辑
                             </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4">
                        {analysis.insights.map((insight, idx) => (
                          <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            key={insight.id}
                            className="group p-5 rounded-2xl border border-border-theme hover:border-accent-theme/30 hover:bg-accent-theme/[0.02] transition-all"
                          >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-zinc-100 rounded-lg text-zinc-600 group-hover:bg-accent-theme/10 group-hover:text-accent-theme transition-colors">
                                {categoryIcons[insight.category]}
                              </div>
                              <h3 className="text-sm font-bold text-text-primary">{insight.title}</h3>
                            </div>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                              priorityColors[insight.priority]
                            )}>
                              {insight.priority} 优先级
                            </span>
                          </div>
                          <p className="text-xs text-text-secondary mb-3 leading-relaxed">
                            {insight.description}
                          </p>
                          <div className="bg-white border border-zinc-100 rounded-xl p-3 flex items-start gap-3">
                            <ChevronRight className="w-3.5 h-3.5 text-accent-theme mt-0.5 shrink-0" />
                            <p className="text-xs font-medium text-text-primary leading-relaxed italic">
                              {insight.suggestion}
                            </p>
                          </div>

                          <div className="mt-3 flex justify-end">
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => handleDiscussWithAI(insight)}
                                  className="flex items-center gap-1.5 text-[10px] font-bold text-text-secondary hover:text-accent-theme transition-colors px-2 py-1 rounded-lg hover:bg-accent-theme/5"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  呼叫 AI 伙伴深度讨论
                                </button>
                                <button 
                                  onClick={() => handleUltraplan(`关于“${insight.title}”的深度战略演化：${insight.description}`)}
                                  className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-500 hover:text-indigo-600 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
                                >
                                  <Brain className="w-3 h-3" />
                                  Ultraplan 深度战略规划
                                </button>
                              </div>
                            </div>

                          {/* Fix Action */}
                          {insight.hasFix && (
                            <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-col gap-3">
                              {patchData?.id === insight.id ? (
                                <motion.div 
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="space-y-3"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      AI 修复方案已生成
                                    </span>
                                    <span className="text-[10px] font-mono text-text-secondary">{patchData.file}</span>
                                  </div>
                                  <div className="rounded-xl overflow-hidden text-[10px] border border-border-theme">
                                    <SyntaxHighlighter 
                                      language="typescript" 
                                      style={vscDarkPlus}
                                      customStyle={{ margin: 0, padding: '12px' }}
                                    >
                                      {patchData.patch}
                                    </SyntaxHighlighter>
                                  </div>
                                  <div className="text-[10px] text-text-secondary bg-zinc-50 p-2 rounded-lg border border-zinc-100 italic">
                                    {patchData.explanation}
                                  </div>
                                  <div className="flex gap-2">
                                    <button 
                                      onClick={handleConfirmApply}
                                      disabled={isApplyingFix}
                                      className="flex-[2] py-1.5 bg-text-primary text-white rounded-lg text-[10px] font-bold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 group"
                                    >
                                      {isApplyingFix ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Zap className="w-3 h-3 text-amber-400 group-hover:scale-125 transition-transform" />
                                      )}
                                      确认执行修复 (Apply)
                                    </button>
                                    <button 
                                      onClick={() => {
                                        navigator.clipboard.writeText(patchData.patch);
                                      }}
                                      className="flex-1 py-1.5 bg-zinc-100 text-text-primary rounded-lg text-[10px] font-bold hover:bg-zinc-200 transition-colors"
                                    >
                                      复制代码
                                    </button>
                                    <button 
                                      onClick={() => setPatchData(null)}
                                      className="px-3 py-1.5 border border-zinc-200 text-text-secondary rounded-lg text-[10px] font-bold hover:bg-zinc-50"
                                    >
                                      收起
                                    </button>
                                  </div>
                                  {applySuccess && (
                                    <div className="text-[10px] text-emerald-600 font-bold animate-bounce flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      {applySuccess}
                                    </div>
                                  )}
                                </motion.div>
                              ) : (
                                <button
                                  onClick={() => handleApplyFix(insight)}
                                  disabled={isPatching !== null}
                                  className={cn(
                                    "flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-[10px] font-bold transition-all",
                                    isPatching === insight.id 
                                      ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                                      : "bg-accent-theme/5 text-accent-theme hover:bg-accent-theme hover:text-white"
                                  )}
                                >
                                  {isPatching === insight.id ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      正在构建 AI 代码补丁...
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="w-3 h-3" />
                                      AI 智能修复 (Beta)
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ) : (
                    <div className="text-center py-20">
                      <AlertCircle className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                      <p className="text-sm text-text-secondary">暂时没有发现明显的建议，项目状态良好！</p>
                    </div>
                  )}
                </div>
              ) : activeTab === 'graph' ? (
                <div className="space-y-6">
                  {analysis ? (
                    <ProjectGraph 
                      tree={analysis.context.tree} 
                      dependencies={analysis.context.dependencies}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 opacity-40">
                      <FileCode className="w-12 h-12 mb-4" />
                      <p className="text-sm font-bold">请先开启项目扫描以获取架构图谱</p>
                    </div>
                  )}
                </div>
              ) : activeTab === 'roadmap' ? (
                <div className="space-y-12 py-4">
                  {isGeneratingRoadmap ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                      <Calendar className="w-10 h-10 text-accent-theme animate-pulse" />
                      <p className="text-sm font-bold text-text-secondary">AI 正在规划未来 6 个月的技术里程碑...</p>
                    </div>
                  ) : roadmap.length > 0 ? (
                    <div className="space-y-16 relative before:absolute before:left-[45px] before:top-8 before:bottom-8 before:w-[1px] before:bg-zinc-200">
                      {roadmap.map((item, idx) => (
                        <div key={item.id} className="relative pl-24 group">
                          <div className="absolute left-0 top-0 font-serif text-[100px] leading-none text-zinc-100 font-black -z-10 select-none group-hover:text-accent-theme/10 transition-colors">
                            {(idx + 1).toString().padStart(2, '0')}
                          </div>
                          <div className="absolute left-[38px] top-4 w-4 h-4 rounded-full border-4 border-white bg-accent-theme shadow-sm z-10" />
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <span className="px-2 py-0.5 bg-zinc-100 text-[10px] font-bold text-zinc-600 rounded uppercase tracking-tighter">
                                {item.milestone}
                              </span>
                              <span className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded",
                                item.priority === 'high' ? "bg-red-50 text-red-600" : "bg-zinc-50 text-zinc-500"
                              )}>
                                {item.priority.toUpperCase()}
                              </span>
                            </div>
                            <h3 className="text-xl font-black text-text-primary tracking-tight group-hover:text-accent-theme transition-colors">
                              {item.title}
                            </h3>
                            <p className="text-sm text-text-secondary leading-relaxed max-w-lg">
                              {item.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-24 px-12 bg-zinc-50 rounded-[40px] border border-zinc-100 border-dashed">
                      <Milestone className="w-12 h-12 text-zinc-300 mx-auto mb-6" />
                      <h3 className="text-lg font-bold text-text-primary mb-2">生成技术路线图</h3>
                      <p className="text-sm text-text-secondary mb-8 max-w-sm mx-auto">基于当前项目成熟度与市场前沿趋势，为您定制专属的技术演进规划。</p>
                      <button 
                        onClick={handleGenerateRoadmap}
                        className="px-10 py-4 bg-text-primary text-white rounded-2xl font-bold shadow-xl hover:scale-105 transition-all"
                      >
                        立即生成路线图
                      </button>
                    </div>
                  )}
                </div>
              ) : activeTab === 'docs' ? (
                <div className="space-y-6">
                  {isGeneratingDocs ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                      <Loader2 className="w-10 h-10 text-accent-theme animate-spin" />
                      <p className="text-sm font-bold text-text-secondary">AI 正在撰写 ARCHITECTURE.md...</p>
                    </div>
                  ) : docs ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-zinc-50 rounded-3xl p-8 border border-border-theme prose prose-sm max-w-none prose-headings:text-text-primary prose-p:text-text-secondary"
                    >
                      <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-200">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-accent-theme" />
                          <h3 className="text-lg font-black text-text-primary">ARCHITECTURE.md (AI Generated)</h3>
                        </div>
                        <button 
                          onClick={() => navigator.clipboard.writeText(docs)}
                          className="px-4 py-1.5 bg-white border border-border-theme rounded-xl text-[10px] font-bold hover:bg-zinc-100 transition-colors shadow-sm"
                        >
                          复制 Markdown
                        </button>
                      </div>
                      <div className="markdown-body">
                        <Markdown remarkPlugins={[remarkGfm]}>{docs}</Markdown>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="text-center py-20">
                      <button 
                        onClick={handleGenerateDocs}
                        className="px-8 py-3 bg-accent-theme text-white rounded-2xl font-bold shadow-lg shadow-accent-theme/20 hover:scale-105 transition-all"
                      >
                        生成项目核心文档
                      </button>
                    </div>
                  )}
                </div>
              ) : activeTab === 'coordinator' ? (
                <div className="space-y-6">
                  <div className="p-8 bg-zinc-900 text-zinc-100 rounded-3xl relative overflow-hidden">
                    <Brain className="absolute -right-8 -top-8 w-40 h-40 text-white/5" />
                    <div className="relative">
                      <h3 className="text-xl font-bold mb-2 flex items-center gap-3">
                        <Activity className="w-6 h-6 text-indigo-400" />
                        多智能体协调器 (Coordinator Mode)
                      </h3>
                      <p className="text-sm text-zinc-400 mb-8 max-w-md">通过分解复杂任务并调度专业子代理，实现从研究到验证的全链路闭环。</p>
                      
                      {!coordinatorPlan ? (
                        <div className="flex flex-col gap-4">
                          <input 
                            type="text" 
                            placeholder="输入宏伟的项目目标 (例如：迁移到 NestJS 架构并实现 OAuth2)..."
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCoordinator(e.currentTarget.value);
                            }}
                          />
                          <button 
                            onClick={(e) => {
                              const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                              handleCoordinator(input.value);
                            }}
                            disabled={isCoordinating}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                          >
                            {isCoordinating ? <Loader2 className="w-5 h-5 animate-spin" /> : "启动协调引擎"}
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[
                            { title: "RESEARCH (研究)", data: coordinatorPlan.research, icon: <Search className="w-4 h-4 text-sky-400" /> },
                            { title: "SYNTHESIS (综合)", data: coordinatorPlan.synthesis, icon: <Brain className="w-4 h-4 text-purple-400" /> },
                            { title: "IMPLEMENTATION (实施)", data: coordinatorPlan.implementation, icon: <Cpu className="w-4 h-4 text-emerald-400" /> },
                            { title: "VERIFICATION (验证)", data: coordinatorPlan.verification, icon: <ShieldCheck className="w-4 h-4 text-amber-400" /> }
                          ].map((stage, i) => (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.1 }}
                              key={i} 
                              className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50 relative group"
                            >
                              <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 mb-3 tracking-widest uppercase">
                                {stage.icon}
                                {stage.title}
                              </div>
                              <div className="text-sm font-bold text-zinc-100 mb-2 truncate" title={stage.data.task}>任务: {stage.data.task}</div>
                              <div className="text-[11px] text-zinc-400 leading-relaxed italic border-l-2 border-zinc-700 pl-3">"{stage.data.insight}"</div>
                            </motion.div>
                          ))}
                          <button 
                            onClick={() => setCoordinatorPlan(null)}
                            className="md:col-span-2 py-3 border border-zinc-800 rounded-xl text-[10px] uppercase font-bold text-zinc-600 hover:text-zinc-400 transition-colors"
                          >
                            重置会话
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : activeTab === 'kairos' ? (
                <div className="space-y-6 h-full flex flex-col">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                      <h3 className="text-sm font-black text-text-primary tracking-widest uppercase">KAIROS_DAEMON_PATROL</h3>
                    </div>
                    <div className="text-[10px] text-text-secondary font-mono">
                      LAST_PATROL: {lastPatrol ? new Date(lastPatrol).toLocaleTimeString() : 'N/A'}
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto bg-[#0c0c0c] rounded-3xl border border-zinc-800 p-6 font-mono text-xs text-amber-500/80 space-y-3 shadow-inner">
                    <div className="text-[10px] opacity-30 sticky top-0 bg-[#0c0c0c]/80 backdrop-blur-sm pb-2 border-b border-zinc-900 mb-4">
                      SYSTEM_WATCHDOG_LOGS {'>'}_
                    </div>
                    {kairosLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-zinc-700">
                        <Activity className="w-12 h-12 mb-4 animate-pulse" />
                        <p>巡逻引擎初始化中...</p>
                      </div>
                    ) : (
                      kairosLogs.map((log, i) => (
                        <div key={i} className="flex gap-4 group">
                          <span className="opacity-30 whitespace-nowrap">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <span className="text-[#33ff33]/80 group-hover:text-white transition-colors">{log.event}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : activeTab === 'lab' ? (
                <div className="h-[600px] overflow-hidden rounded-3xl">
                  <TerminalPet />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-6 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-3xl border border-blue-100 relative overflow-hidden group">
                    <Rocket className="absolute -right-4 -bottom-4 w-32 h-32 text-blue-200/50 -rotate-12 group-hover:rotate-0 transition-transform duration-700" />
                    <div className="relative">
                      <h3 className="text-lg font-bold text-blue-900 mb-2">一键生成部署管道 (Landing Pipeline)</h3>
                      <p className="text-sm text-blue-700/80 mb-6 max-w-md leading-relaxed">基于项目分析结果，自动为您配置生产环境所需的 CI/CD、Docker 及资源清单。</p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={() => handleGenerateDeploy('docker')}
                          disabled={isGeneratingDeploy}
                          className="p-4 bg-white rounded-2xl shadow-sm border border-blue-100 hover:scale-[1.02] transition-transform text-left"
                        >
                          <FileCode className="w-5 h-5 text-blue-600 mb-3" />
                          <div className="text-xs font-bold text-blue-900 mb-1">Dockerfile & Compose</div>
                          <div className="text-[10px] text-blue-600/60 font-medium tracking-tight">自动容器化方案</div>
                        </button>
                        <button 
                          onClick={() => handleGenerateDeploy('github-actions')}
                          disabled={isGeneratingDeploy}
                          className="p-4 bg-white rounded-2xl shadow-sm border border-blue-100 hover:scale-[1.02] transition-transform text-left"
                        >
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-3" />
                          <div className="text-xs font-bold text-blue-900 mb-1">GitHub Actions</div>
                          <div className="text-[10px] text-blue-600/60 font-medium tracking-tight">自动流水线部署</div>
                        </button>
                      </div>

                      {isGeneratingDeploy && (
                        <div className="mt-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center gap-3">
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                          <span className="text-[10px] font-bold text-blue-700 animate-pulse">AI 正在分析项目环境并生成最佳部署配置...</span>
                        </div>
                      )}

                      {deploymentFiles.length > 0 && !isGeneratingDeploy && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-6 space-y-4"
                        >
                          <div className="text-xs font-bold text-blue-900 flex items-center gap-2">
                             <Zap className="w-4 h-4 text-amber-500" />
                             已生成部署资产 ({deploymentFiles.length})
                          </div>
                          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-blue-100">
                            {deploymentFiles.map((file, i) => (
                              <div key={i} className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-[10px] font-mono font-bold text-blue-700">{file.name}</span>
                                  <button 
                                    onClick={() => navigator.clipboard.writeText(file.content)}
                                    className="text-[10px] font-bold text-blue-600 hover:underline"
                                  >
                                    复制代码
                                  </button>
                                </div>
                                <div className="rounded-xl overflow-hidden text-[10px] border border-blue-100">
                                  <SyntaxHighlighter 
                                    language={file.language} 
                                    style={vscDarkPlus}
                                    customStyle={{ margin: 0, padding: '12px' }}
                                  >
                                    {file.content}
                                  </SyntaxHighlighter>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 mt-8">
                    <div className="flex items-center justify-between px-1">
                      <div className="text-xs font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp className="w-3 h-3 text-accent-theme" />
                        生产环境全域预检 (Pre-flight)
                      </div>
                      <button 
                        onClick={handleRunPreflight}
                        disabled={isChecking}
                        className="text-[10px] font-bold text-accent-theme hover:underline disabled:opacity-50"
                      >
                        {isChecking ? '检查中...' : '重新检测'}
                      </button>
                    </div>

                    {isChecking ? (
                      <div className="py-8 flex flex-col items-center justify-center bg-zinc-50 border border-zinc-100 rounded-2xl border-dashed">
                        <Loader2 className="w-6 h-6 text-accent-theme animate-spin mb-2" />
                        <span className="text-[10px] text-text-secondary">正在扫描源码中的安全漏洞与配置缺失...</span>
                      </div>
                    ) : preflightResults.length > 0 ? (
                      <div className="space-y-2">
                        {preflightResults.map((check) => (
                          <div key={check.id} className="flex items-start gap-3 p-3 rounded-xl border border-zinc-100 bg-white shadow-sm">
                            <div className={cn(
                              "mt-0.5 p-1 rounded-full",
                              check.status === 'pass' ? "bg-emerald-100 text-emerald-600" : 
                              check.status === 'fail' ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                            )}>
                              {check.status === 'pass' ? <CheckCircle2 className="w-3 h-3" /> : 
                               check.status === 'fail' ? <X className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            </div>
                            <div>
                               <div className="text-xs font-bold text-text-primary">{check.name}</div>
                               <div className="text-[10px] text-text-secondary mt-0.5 leading-relaxed">{check.message}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <button 
                        onClick={handleRunPreflight}
                        className="w-full py-6 border-2 border-dashed border-zinc-200 rounded-3xl text-zinc-400 hover:border-accent-theme hover:text-accent-theme hover:bg-accent-theme/5 transition-all group"
                      >
                        <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-50 group-hover:scale-110 transition-transform" />
                        <div className="text-sm font-bold">立即进行生产环境预检</div>
                        <div className="text-[10px] opacity-70 mt-1">检测环境变量、代码漏洞及构建逻辑</div>
                      </button>
                    )}

                    <div className="text-xs font-bold text-text-secondary uppercase tracking-widest px-1 flex items-center gap-2 mt-4">
                      <TrendingUp className="w-3 h-3 text-accent-theme" />
                      技术趋势建议引入
                    </div>
                    {[
                      { title: "引入 Tailwind 4.0 与 Oxide 编译器", desc: "极致提升编译速度与 CSS 体积控制", trend: "+ 40% Perf" },
                      { title: "配置 Vite 6.0 分块加载策略", desc: "减少首屏加载 FCP 时间，提升 SEO", trend: "Modern" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-2xl border border-zinc-100 hover:bg-zinc-50 transition-colors">
                        <div className="flex gap-4 items-center">
                          <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-500">
                            {i === 0 ? <Zap className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-text-primary">{item.title}</div>
                            <div className="text-[10px] text-text-secondary">{item.desc}</div>
                          </div>
                        </div>
                        <div className="text-[10px] font-black text-accent-theme px-2 py-1 bg-accent-theme/5 rounded-md">
                          {item.trend}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

          {/* Handover Dialog / Overlay */}
          <AnimatePresence>
            {isHandoverMode && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-x-0 bottom-0 top-0 z-[100] bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center"
              >
                <div className="w-16 h-16 bg-accent-theme/10 rounded-3xl flex items-center justify-center mb-6">
                  <Package className="w-8 h-8 text-accent-theme" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-2">生成技术交接包</h3>
                <p className="text-sm text-text-secondary max-w-sm mb-8">
                  正在根据您的设计意图、品牌规范和选定的架构，打包一份完整的技术交接文件，可一键导入 Claude Code 进入开发环节。
                </p>
                <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex flex-col items-start gap-2">
                    <BrandIcon className="w-4 h-4 text-accent-theme" />
                    <span className="text-xs font-bold">品牌系统同步</span>
                    <div className="w-full h-1 bg-zinc-200 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1 }} className="h-full bg-accent-theme" />
                    </div>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex flex-col items-start gap-2">
                    <FileCode className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-bold">组件规范提取</span>
                    <div className="w-full h-1 bg-zinc-200 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: '85%' }} transition={{ duration: 1.5 }} className="h-full bg-indigo-500" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setIsHandoverMode(false)}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-text-secondary hover:bg-zinc-100 transition-all"
                  >
                    返回修改
                  </button>
                  <button 
                    onClick={() => {
                      alert('交接包已准备就绪，正在启动 Claude Code...');
                      setIsHandoverMode(false);
                    }}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold bg-text-primary text-white hover:opacity-90 transition-all shadow-xl"
                  >
                    立即交付实现
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>

        {/* Side Tweaks / Brand Panel */}
        <AnimatePresence>
          {isTweaksPanelOpen && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="w-72 border-l border-border-theme bg-zinc-50/50 flex flex-col pt-4 overflow-hidden"
            >
              <div className="px-5 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-accent-theme" />
                    <h4 className="text-[11px] font-bold text-text-primary uppercase tracking-widest">实时调节 (Knobs)</h4>
                  </div>
                  <button onClick={() => setIsTweaksPanelOpen(false)} className="p-1 hover:bg-zinc-200 rounded">
                    <X className="w-3 h-3 text-text-secondary" />
                  </button>
                </div>
                <p className="text-[10px] text-text-secondary font-medium">AI 自动生成参数滑块</p>
              </div>

              <div className="px-5 space-y-6 flex-1 overflow-y-auto pb-10">
                {/* Brand System Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">
                    <BrandIcon className="w-3 h-3" />
                    品牌系统感知
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-border-theme shadow-sm">
                    <div className="text-[10px] font-bold text-text-secondary mb-3">自动读取代码库规范</div>
                    <div className="flex flex-wrap gap-2">
                      {['#D97757', '#F9F9F8', '#1A1A18', '#6B6B67'].map(c => (
                        <div key={c} className="w-6 h-6 rounded-full border border-border-theme" style={{ backgroundColor: c }} title={c} />
                      ))}
                    </div>
                    <div className="mt-3 text-[10px] text-zinc-400 leading-tight">
                      已自动应用 Inter 字体及 1.5x 视觉层级。
                    </div>
                  </div>
                </div>

                {/* Tweaks Sliders */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">
                    <Activity className="w-3 h-3" />
                    视觉微调
                  </div>
                  
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] font-bold text-text-secondary">
                        <span>主色调</span>
                        <span>{canvasTweaks.primaryColor}</span>
                      </div>
                      <input 
                        type="color" 
                        value={canvasTweaks.primaryColor}
                        onChange={(e) => setCanvasTweaks({...canvasTweaks, primaryColor: e.target.value})}
                        className="w-full h-8 cursor-pointer bg-white p-1 rounded-lg border border-border-theme"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] font-bold text-text-secondary">
                        <span>圆角弧度</span>
                        <span>{canvasTweaks.borderRadius}px</span>
                      </div>
                      <input 
                        type="range" min="0" max="32"
                        value={canvasTweaks.borderRadius}
                        onChange={(e) => setCanvasTweaks({...canvasTweaks, borderRadius: parseInt(e.target.value)})}
                        className="w-full accent-accent-theme"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] font-bold text-text-secondary">
                        <span>排版字号</span>
                        <span>{canvasTweaks.fontSize}px</span>
                      </div>
                      <input 
                        type="range" min="10" max="24"
                        value={canvasTweaks.fontSize}
                        onChange={(e) => setCanvasTweaks({...canvasTweaks, fontSize: parseInt(e.target.value)})}
                        className="w-full accent-accent-theme"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button className="w-full py-2 bg-text-primary text-white text-[11px] font-bold rounded-xl hover:opacity-90 transition-opacity">
                    应用到所有组件
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

            {/* Footer */}
            <div className="px-8 py-4 bg-zinc-50 border-t border-border-theme flex items-center justify-between">
              <div className="flex items-center gap-4">
                <AnimatePresence>
                  {copiedMsg && (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="absolute bottom-20 left-8 bg-black text-white px-4 py-2 rounded-xl text-[10px] font-bold shadow-2xl z-50 flex items-center gap-2"
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      {copiedMsg}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex -space-x-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-zinc-200" />
                  ))}
                </div>
                <button 
                  onClick={handleExportReport}
                  disabled={!analysis}
                  className="flex items-center gap-2 text-[10px] font-bold text-accent-theme hover:bg-accent-theme/5 px-3 py-1.5 rounded-lg transition-colors border border-accent-theme/20 disabled:opacity-50"
                >
                  <Download className="w-3 h-3" />
                  导出完整报告 (JSON)
                </button>
              </div>
              <button 
                onClick={onClose}
                className="px-6 py-2 bg-text-primary text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors"
              >
                了解并关闭
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
