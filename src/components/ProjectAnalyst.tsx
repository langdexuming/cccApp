import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, ChevronRight, AlertCircle, TrendingUp, Cpu, ShieldCheck, Loader2, X, RefreshCw, Sparkles, Rocket, FileCode, CheckCircle2, Search, Zap, Globe, FileText, Download, Milestone, Calendar } from 'lucide-react';
import { getProjectInsights, getInsightFix, generateProjectDocs, runPreflightChecks, generateDeploymentConfig, applyInsightFix, getProjectRoadmap, PreflightCheck, DeploymentFile, RoadmapItem } from '../services/analysisService';
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
}

export function ProjectAnalyst({ isOpen, onClose, settings, allProviders, onUpdateSettings }: ProjectAnalystProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'insights' | 'graph' | 'roadmap' | 'docs' | 'landing'>('insights');
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            {/* Header */}
            <div className="px-8 pt-6 border-b border-border-theme flex flex-col bg-zinc-50/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-accent-theme/10 rounded-2xl">
                    <Sparkles className="w-6 h-6 text-accent-theme" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-text-primary tracking-tight">项目全生命周期 AI 增强</h2>
                    <p className="text-xs text-text-secondary font-medium">自动扫描分析 · 最新趋势感知 · 落地部署辅助</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fetchInsights()}
                    disabled={isLoading}
                    className="p-2 hover:bg-zinc-200 rounded-full transition-colors text-text-secondary disabled:opacity-50"
                    title="重新扫描项目"
                  >
                    <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
                  </button>
                  <button 
                    onClick={onClose}
                    className="p-2 hover:bg-zinc-200 rounded-full transition-colors text-text-secondary"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Tabs */}
              <div className="flex items-center justify-between border-b border-border-theme pr-4">
                <div className="flex gap-6">
                  <button
                    onClick={() => setActiveTab('insights')}
                    className={cn(
                      "pb-3 text-sm font-bold transition-all border-b-2",
                      activeTab === 'insights' ? "border-accent-theme text-accent-theme" : "border-transparent text-text-secondary hover:text-text-primary"
                    )}
                  >
                    智能优选意见
                  </button>
                  <button
                    onClick={() => setActiveTab('graph')}
                    className={cn(
                      "pb-3 text-sm font-bold transition-all border-b-2",
                      activeTab === 'graph' ? "border-accent-theme text-accent-theme" : "border-transparent text-text-secondary hover:text-text-primary"
                    )}
                  >
                    架构图谱
                  </button>
                  <button
                    onClick={() => setActiveTab('roadmap')}
                    className={cn(
                      "pb-3 text-sm font-bold transition-all border-b-2",
                      activeTab === 'roadmap' ? "border-accent-theme text-accent-theme" : "border-transparent text-text-secondary hover:text-text-primary"
                    )}
                  >
                    技术路线图
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('docs');
                      if (!docs) handleGenerateDocs();
                    }}
                    className={cn(
                      "pb-3 text-sm font-bold transition-all border-b-2",
                      activeTab === 'docs' ? "border-accent-theme text-accent-theme" : "border-transparent text-text-secondary hover:text-text-primary"
                    )}
                  >
                    文档助手
                  </button>
                  <button
                    onClick={() => setActiveTab('landing')}
                    className={cn(
                      "pb-3 text-sm font-bold transition-all border-b-2",
                      activeTab === 'landing' ? "border-accent-theme text-accent-theme" : "border-transparent text-text-secondary hover:text-text-primary"
                    )}
                  >
                    部署落地实验室 (Beta)
                  </button>
                </div>
                
                {/* Provider Selector */}
                <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl mb-2">
                  <button
                    onClick={() => {
                      onUpdateSettings({ ...settings, provider: 'gemini' });
                      fetchInsights('gemini');
                    }}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold rounded-lg transition-all",
                      settings.provider === 'gemini' ? "bg-white text-accent-theme shadow-sm" : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    Gemini (Search)
                  </button>
                  <button
                    onClick={() => {
                      onUpdateSettings({ ...settings, provider: 'openai' });
                      fetchInsights('openai');
                    }}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold rounded-lg transition-all",
                      settings.provider === 'openai' ? "bg-white text-zinc-800 shadow-sm" : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    GPT-4o
                  </button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
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
            </div>

            {/* Footer */}
            <div className="px-8 py-4 bg-zinc-50 border-t border-border-theme flex items-center justify-between">
              <div className="flex items-center gap-4">
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
