import {useEffect, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {Bot, CheckCircle2, Cpu, FolderInput, GitBranch, Globe, Info, Key, Plus, RefreshCw, Save, Shield, Sparkles, Trash2, Users, X} from 'lucide-react';
import type {AppSettings, ProviderConfig, ProviderType} from '../types';
import {DEFAULT_SETTINGS} from '../constants';
import {cn} from '../lib/utils';
import {fetchLocalToolConfig, mergeLocalToolConfigIntoSettings} from '../lib/mergeLocalToolConfig';
import {fetchRemoteProviderModels, requestGitSync} from '../lib/desktop';
import {BUILTIN_PROVIDER_MODELS} from '../lib/providerCatalog';

type SettingsTab = ProviderType | 'collaboration' | 'git' | 'analysis';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

export function SettingsModal({isOpen, onClose, settings, onSave}: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [gitConfig, setGitConfig] = useState(settings.git || DEFAULT_SETTINGS.git);
  const [activeTab, setActiveTab] = useState<SettingsTab>('gemini');
  const [showSaved, setShowSaved] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [candidateFilter, setCandidateFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [localImportHint, setLocalImportHint] = useState<string | null>(null);
  const [localImportBusy, setLocalImportBusy] = useState(false);
  const [remoteModelHint, setRemoteModelHint] = useState<string | null>(null);
  const [remoteModelBusy, setRemoteModelBusy] = useState(false);
  const [gitActionBusy, setGitActionBusy] = useState<'pull' | 'push' | null>(null);
  const [gitActionHint, setGitActionHint] = useState<string | null>(null);

  const isProviderTab = activeTab !== 'collaboration' && activeTab !== 'git';
  const currentProvider = (isProviderTab ? activeTab : 'gemini') as ProviderType;
  const currentProviderConfig = localSettings.providers[currentProvider];

  useEffect(() => {
    if (!isOpen) return;
    setLocalSettings(settings);
    setGitConfig(settings.git || DEFAULT_SETTINGS.git);
    setNewModelName('');
    setCandidateFilter('');
    setModelFilter('');
    setLocalImportHint(null);
    setRemoteModelHint(null);
    setGitActionHint(null);
  }, [isOpen, settings]);

  useEffect(() => {
    setNewModelName('');
    setCandidateFilter('');
    setModelFilter('');
    setRemoteModelHint(null);
    setGitActionHint(null);
  }, [activeTab]);

  const updateProvider = (id: ProviderType, updates: Partial<ProviderConfig>) => {
    setLocalSettings((prev) => ({...prev, providers: {...prev.providers, [id]: {...prev.providers[id], ...updates}}}));
  };

  const updateCollaboration = (updates: Partial<AppSettings['collaboration']>) => {
    setLocalSettings((prev) => ({
      ...prev,
      collaboration: {...(prev.collaboration || DEFAULT_SETTINGS.collaboration), ...updates},
    }));
  };

  const updateGit = (updates: Partial<AppSettings['git']>) => {
    setLocalSettings((prev) => ({...prev, git: {...(prev.git || DEFAULT_SETTINGS.git), ...updates}}));
  };

  const addModel = (value?: string) => {
    if (!isProviderTab) return;
    const model = (value ?? newModelName).trim();
    if (!model || currentProviderConfig.models.includes(model)) return;
    updateProvider(currentProvider, {models: [...currentProviderConfig.models, model]});
    setNewModelName('');
  };

  const removeModel = (model: string) => {
    if (!isProviderTab) return;
    updateProvider(currentProvider, {models: currentProviderConfig.models.filter((item) => item !== model)});
  };

  const handleImportLocalToolDirs = async () => {
    setLocalImportBusy(true);
    setLocalImportHint(null);
    const data = await fetchLocalToolConfig();
    setLocalImportBusy(false);
    if (!data?.ok) {
      setLocalImportHint(data?.error ? `读取失败：${data.error}` : '无法读取本机目录。请在桌面版中使用该功能。');
      return;
    }
    setLocalImportHint(data.sources.length ? `已从 ${data.sources.length} 个文件导入本地配置。` : '未发现可导入配置。');
    setLocalSettings((prev) => mergeLocalToolConfigIntoSettings(prev, data));
  };

  const handleFetchRemoteModels = async () => {
    if (!isProviderTab) return;
    setRemoteModelBusy(true);
    setRemoteModelHint(null);
    try {
      const data = await fetchRemoteProviderModels({providerId: currentProvider, settings: localSettings});
      if (!data) {
        setRemoteModelHint('当前运行环境不支持远程模型拉取，请在桌面版中操作。');
        return;
      }
      const merged = Array.from(new Set([...(data.models || []), ...currentProviderConfig.models]));
      updateProvider(currentProvider, {models: merged});
      setRemoteModelHint(data.models.length ? `已拉取 ${data.models.length} 个远程模型。` : '接口已连接，但没有返回模型。');
    } catch (error) {
      setRemoteModelHint(error instanceof Error ? error.message : '远程模型拉取失败。');
    } finally {
      setRemoteModelBusy(false);
    }
  };

  const handleGitAction = async (operation: 'pull' | 'push') => {
    setGitActionBusy(operation);
    setGitActionHint(null);
    try {
      const response = await requestGitSync({git: {...gitConfig, branch: gitConfig.branch || 'main'}, operation});
      if (!response) {
        setGitActionHint('当前运行环境不支持 Git 操作，请在桌面版中使用。');
        return;
      }
      const text = [response.stdout?.trim(), response.stderr?.trim()].filter(Boolean).join('\n');
      const nextGit = {...gitConfig, lastSync: Date.now()};
      setGitConfig(nextGit);
      updateGit(nextGit);
      setGitActionHint(text || (operation === 'pull' ? '拉取完成。' : '推送完成。'));
    } catch (error) {
      setGitActionHint(error instanceof Error ? error.message : `Git ${operation} 失败`);
    } finally {
      setGitActionBusy(null);
    }
  };

  const handleSave = () => {
    onSave({...localSettings, git: gitConfig});
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  const availablePresetModels = isProviderTab ? BUILTIN_PROVIDER_MODELS[currentProvider].filter((model) => !currentProviderConfig.models.includes(model)) : [];
  const filteredPresetModels = availablePresetModels.filter((model) => model.toLowerCase().includes(candidateFilter.toLowerCase()));
  const filteredModels = isProviderTab ? currentProviderConfig.models.filter((model) => model.toLowerCase().includes(modelFilter.toLowerCase())) : [];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} onClick={onClose} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
        <motion.div initial={{opacity: 0, scale: 0.96, y: 20}} animate={{opacity: 1, scale: 1, y: 0}} exit={{opacity: 0, scale: 0.96, y: 20}} className="relative flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-border-theme bg-zinc-50/60 p-6">
            <div>
              <h2 className="text-lg font-bold text-text-primary">模型接入设置</h2>
              <p className="text-xs text-text-secondary">提供商、协同代理和 Git 同步</p>
            </div>
            <button onClick={onClose} className="rounded-full p-2 hover:bg-zinc-100"><X className="h-5 w-5 text-text-secondary" /></button>
          </div>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex w-56 flex-col gap-2 border-r border-border-theme bg-zinc-50/40 p-3">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary">模型提供商</div>
              {(Object.keys(localSettings.providers) as ProviderType[]).map((id) => (
                <button key={id} onClick={() => setActiveTab(id)} className={cn('rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-all', activeTab === id ? 'bg-white text-accent-theme shadow-sm border border-border-theme' : 'text-text-secondary hover:bg-zinc-100 hover:text-text-primary')}>
                  {localSettings.providers[id].name}
                </button>
              ))}
              <div className="mt-3 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary">扩展功能</div>
              <button onClick={() => setActiveTab('collaboration')} className={cn('rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-all', activeTab === 'collaboration' ? 'bg-white text-accent-theme shadow-sm border border-border-theme' : 'text-text-secondary hover:bg-zinc-100 hover:text-text-primary')}><Users className="mr-2 inline h-4 w-4" />多代理协同</button>
              <button onClick={() => setActiveTab('analysis')} className={cn('rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-all', activeTab === 'analysis' ? 'bg-white text-accent-theme shadow-sm border border-border-theme' : 'text-text-secondary hover:bg-zinc-100 hover:text-text-primary')}><Sparkles className="mr-2 inline h-4 w-4" />项目分析</button>
              <button onClick={() => setActiveTab('git')} className={cn('rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-all', activeTab === 'git' ? 'bg-white text-accent-theme shadow-sm border border-border-theme' : 'text-text-secondary hover:bg-zinc-100 hover:text-text-primary')}><GitBranch className="mr-2 inline h-4 w-4" />Git 管理</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-8">
              {activeTab === 'analysis' ? (
                <div className="space-y-8">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-text-primary">项目智能分析配置</h3>
                      <p className="text-sm text-text-secondary mt-1 text-balance">配置项目全生命周期分析所使用的 AI 模型和偏好。</p>
                    </div>
                    <div className="p-3 bg-accent-theme/5 rounded-2xl">
                      <Sparkles className="h-6 w-6 text-accent-theme" />
                    </div>
                  </div>

                  <div className="grid gap-6">
                    <div className="p-6 rounded-2xl border border-border-theme space-y-4 bg-zinc-50/30">
                      <label className="text-xs font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2">
                        <Cpu className="h-3 w-3" />
                        首选分析提供商
                      </label>
                      <div className="flex gap-3">
                        {[
                          { id: 'gemini', name: 'Gemini (带搜索代理)', icon: <Globe className="h-4 w-4" /> },
                          { id: 'openai', name: 'OpenAI (GPT-4o)', icon: <Bot className="h-4 w-4" /> }
                        ].map(provider => (
                          <button
                            key={provider.id}
                            onClick={() => setLocalSettings(prev => ({
                              ...prev,
                              analysis: { ...prev.analysis, provider: provider.id as any }
                            }))}
                            className={cn(
                              "flex-1 p-4 rounded-xl border flex flex-col items-center gap-3 transition-all",
                              localSettings.analysis.provider === provider.id
                                ? "bg-white border-accent-theme ring-2 ring-accent-theme/10 shadow-sm"
                                : "bg-white/50 border-border-theme hover:bg-white"
                            )}
                          >
                            <div className={cn(
                              "p-2 rounded-lg transition-colors",
                              localSettings.analysis.provider === provider.id ? "bg-accent-theme text-white" : "bg-zinc-100 text-zinc-500"
                            )}>
                              {provider.icon}
                            </div>
                            <span className="text-xs font-bold text-text-primary">{provider.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-6 rounded-2xl border border-border-theme bg-zinc-50/30 flex items-center justify-between">
                      <div className="flex gap-4 items-center">
                        <div className="p-2 bg-white rounded-xl border border-border-theme">
                          <RefreshCw className="h-4 w-4 text-zinc-500" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-text-primary">自动扫描项目</div>
                          <div className="text-xs text-text-secondary">开启分析面板时自动启动全域扫描</div>
                        </div>
                      </div>
                      <button
                        onClick={() => setLocalSettings(prev => ({
                          ...prev,
                          analysis: { ...prev.analysis, autoScan: !prev.analysis.autoScan }
                        }))}
                        className={cn(
                          "w-12 h-6 rounded-full p-1 transition-colors duration-200",
                          localSettings.analysis.autoScan ? "bg-accent-theme" : "bg-zinc-200"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded-full bg-white transition-transform duration-200",
                          localSettings.analysis.autoScan ? "translate-x-6" : "translate-x-0"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : activeTab === 'collaboration' ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">多代理协同</h3><button onClick={() => updateCollaboration({enabled: !localSettings.collaboration?.enabled})} className={cn('rounded-full px-3 py-1 text-xs font-bold', localSettings.collaboration?.enabled ? 'bg-accent-theme text-white' : 'bg-zinc-200 text-zinc-600')}>{localSettings.collaboration?.enabled ? '已启用' : '已关闭'}</button></div>
                  {(localSettings.collaboration?.agents || DEFAULT_SETTINGS.collaboration.agents).map((agent, index) => (
                    <div key={agent.id} className="space-y-3 rounded-2xl border border-border-theme bg-zinc-50 p-4">
                      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-accent-theme" /><span className="text-sm font-bold text-text-primary">{agent.name}</span></div><button onClick={() => { const agents = [...(localSettings.collaboration?.agents || DEFAULT_SETTINGS.collaboration.agents)]; agents[index] = {...agent, enabled: !agent.enabled}; updateCollaboration({agents}); }} className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold', agent.enabled ? 'bg-green-100 text-green-700' : 'bg-zinc-200 text-zinc-500')}>{agent.enabled ? '已启用' : '已禁用'}</button></div>
                      <textarea value={agent.systemPrompt} onChange={(e) => { const agents = [...(localSettings.collaboration?.agents || DEFAULT_SETTINGS.collaboration.agents)]; agents[index] = {...agent, systemPrompt: e.target.value}; updateCollaboration({agents}); }} rows={3} className="w-full rounded-xl border border-border-theme bg-white px-3 py-2 text-xs" />
                    </div>
                  ))}
                </div>
              ) : activeTab === 'git' ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">Git 版本管理</h3><button onClick={() => setGitConfig((prev) => ({...prev, enabled: !prev.enabled}))} className={cn('rounded-full px-3 py-1 text-xs font-bold', gitConfig.enabled ? 'bg-accent-theme text-white' : 'bg-zinc-200 text-zinc-600')}>{gitConfig.enabled ? '已启用' : '已关闭'}</button></div>
                  <div className="space-y-4 rounded-2xl border border-border-theme bg-zinc-50 p-4">
                    <input type="text" value={gitConfig.repoUrl || ''} onChange={(e) => setGitConfig((prev) => ({...prev, repoUrl: e.target.value}))} placeholder="https://github.com/user/repo.git" className="w-full rounded-xl border border-border-theme bg-white px-4 py-2.5 text-sm" />
                    <input type="text" value={gitConfig.branch || 'main'} onChange={(e) => setGitConfig((prev) => ({...prev, branch: e.target.value}))} placeholder="main" className="w-full rounded-xl border border-border-theme bg-white px-4 py-2.5 text-sm" />
                    <button onClick={() => { updateGit(gitConfig); handleSave(); }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent-theme/20 bg-accent-theme/10 py-2.5 text-xs font-bold text-accent-theme"><Save className="h-4 w-4" />应用并保存 Git 配置</button>
                    <div className="flex gap-3"><button type="button" disabled={gitActionBusy !== null} onClick={() => handleGitAction('pull')} className="flex-1 rounded-xl border border-border-theme bg-white py-3 text-xs font-bold disabled:opacity-50">{gitActionBusy === 'pull' ? '拉取中...' : '拉取 (Pull)'}</button><button type="button" disabled={gitActionBusy !== null} onClick={() => handleGitAction('push')} className="flex-1 rounded-xl border border-border-theme bg-white py-3 text-xs font-bold disabled:opacity-50">{gitActionBusy === 'push' ? '推送中...' : '推送 (Push)'}</button></div>
                    {gitActionHint ? <p className="text-[11px] leading-relaxed text-text-secondary">{gitActionHint}</p> : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">{currentProviderConfig.name} 配置</h3><button onClick={() => updateProvider(currentProvider, {enabled: !currentProviderConfig.enabled})} className={cn('rounded-full px-3 py-1 text-xs font-bold', currentProviderConfig.enabled ? 'bg-accent-theme text-white' : 'bg-zinc-200 text-zinc-600')}>{currentProviderConfig.enabled ? '已启用' : '已关闭'}</button></div>
                  <div className="space-y-4 rounded-2xl border border-border-theme bg-zinc-50 p-4">
                    {currentProvider === 'vertex_ai' ? (
                      <p className="text-[11px] leading-relaxed text-text-secondary rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
                        请在聊天顶栏选中「Google Vertex AI」。接入与官方一致：HTTPS 主机名为「区域 -aiplatform.googleapis.com」，路径为 v1/projects/项目ID/locations/区域/publishers/google/models/模型名:generateContent；令牌 scope 为 https://www.googleapis.com/auth/cloud-platform。桌面版若留空令牌，使用 gcp_auth 的 ADC（服务账号 JSON 路径放 GOOGLE_APPLICATION_CREDENTIALS，或执行 gcloud auth application-default login）；也可手动粘贴短期 OAuth 访问令牌。连接超时请检查代理/VPN。桌面端 HTTP 会读取环境变量中的 HTTP_PROXY、HTTPS_PROXY、NO_PROXY（设置后需重启应用）；不会自动沿用浏览器里的「系统代理」开关，若仅用系统代理界面配置，请改为写入上述环境变量或使用 TUN 类全局 VPN。
                      </p>
                    ) : null}
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-text-secondary">{currentProvider === 'vertex_ai' ? 'OAuth 访问令牌（可选，桌面留空走 ADC）' : 'API Key / OAuth Token'}</label><input type="password" value={currentProviderConfig.apiKey} onChange={(e) => updateProvider(currentProvider, {apiKey: e.target.value})} placeholder={currentProvider === 'vertex_ai' ? '留空则桌面端使用 gcp_auth / ADC' : `输入 ${currentProviderConfig.name} 的 API Key`} className="w-full rounded-xl border border-border-theme bg-white px-4 py-2.5 text-sm" /></div>
                    {currentProvider === 'vertex_ai' ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-text-secondary">GCP Project ID</label>
                          <input 
                            type="text" 
                            value={currentProviderConfig.projectId || ''} 
                            onChange={(e) => updateProvider(currentProvider, {projectId: e.target.value})} 
                            placeholder="your-project-id"
                            className="w-full rounded-xl border border-border-theme bg-white px-4 py-2.5 text-sm" 
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-text-secondary">GCP Location (e.g. us-central1)</label>
                          <input 
                            type="text" 
                            value={currentProviderConfig.baseUrl || ''} 
                            onChange={(e) => updateProvider(currentProvider, {baseUrl: e.target.value})} 
                            placeholder="us-central1"
                            className="w-full rounded-xl border border-border-theme bg-white px-4 py-2.5 text-sm" 
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1.5"><label className="text-xs font-semibold text-text-secondary">Base URL</label><input type="text" value={currentProviderConfig.baseUrl || ''} onChange={(e) => updateProvider(currentProvider, {baseUrl: e.target.value})} className="w-full rounded-xl border border-border-theme bg-white px-4 py-2.5 text-sm" /></div>
                    )}
                    {(currentProvider === 'claude' || currentProvider === 'openai' || currentProvider === 'custom') ? <div className="space-y-1.5"><label className="text-xs font-semibold text-text-secondary">接口协议</label><select value={currentProviderConfig.wireApi || (currentProvider === 'claude' ? 'messages' : 'chat_completions')} onChange={(e) => updateProvider(currentProvider, {wireApi: e.target.value as ProviderConfig['wireApi']})} className="w-full rounded-xl border border-border-theme bg-white px-4 py-2.5 text-sm">{currentProvider === 'claude' ? <><option value="messages">messages</option><option value="chat_completions">chat/completions</option><option value="cli">CLI (本地 claude.exe)</option></> : <><option value="chat_completions">chat/completions</option><option value="responses">responses</option></>}</select>{currentProvider === 'claude' && currentProviderConfig.wireApi === 'cli' ? <p className="text-[10px] leading-relaxed text-text-secondary">通过本地 <code>claude</code> CLI 子进程发送请求，绕过直连 HTTP。需要已安装 Claude Code CLI；Base URL 与 Auth Token 会作为环境变量传入子进程。</p> : null}</div> : null}
                    <div className="flex gap-2"><input type="text" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addModel()} placeholder="输入模型 ID，例如 gpt-5.4" className="flex-1 rounded-xl border border-border-theme bg-white px-4 py-2 text-sm" /><button onClick={() => addModel()} className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-bold"><Plus className="h-4 w-4" /></button></div>
                    {currentProvider === 'claude' ? <div className="space-y-2"><button type="button" disabled={remoteModelBusy} onClick={handleFetchRemoteModels} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border-theme bg-white px-4 py-2.5 text-xs font-bold disabled:opacity-50"><RefreshCw className={cn('h-3.5 w-3.5', remoteModelBusy && 'animate-spin')} />{remoteModelBusy ? '正在拉取远程模型...' : '从当前 Claude 接口拉取远程模型'}</button>{remoteModelHint ? <p className="text-[10px] text-text-secondary">{remoteModelHint}</p> : null}</div> : null}
                    {availablePresetModels.length > 0 ? <div className="space-y-2"><input type="text" value={candidateFilter} onChange={(e) => setCandidateFilter(e.target.value)} placeholder="搜索可添加模型..." className="w-full rounded-xl border border-border-theme bg-white px-3 py-2 text-xs" /><div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border-theme bg-white p-2">{filteredPresetModels.length > 0 ? filteredPresetModels.slice(0, 16).map((model) => <div key={model} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-zinc-50"><span className="break-all text-xs text-text-primary">{model}</span><button type="button" onClick={() => addModel(model)} className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-bold">添加</button></div>) : <div className="px-2 py-4 text-center text-[11px] text-text-secondary">没有匹配的候选模型。</div>}</div></div> : null}
                    <div className="space-y-2"><input type="text" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} placeholder="筛选已添加模型..." className="w-full rounded-xl border border-border-theme bg-white px-3 py-2 text-xs" /><div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border-theme bg-white p-2">{filteredModels.map((model) => <div key={model} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-zinc-50"><span className="break-all text-xs text-text-primary">{model}</span><button type="button" onClick={() => removeModel(model)} className="rounded p-1.5 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></div>)}{filteredModels.length === 0 ? <div className="px-2 py-4 text-center text-[11px] text-text-secondary">没有匹配的已添加模型。</div> : null}</div></div>
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex gap-3"><Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" /><p className="text-[10px] leading-relaxed text-blue-800/70">API Key 仅保存在本地配置中，请确保在可信设备上使用。</p></div></div>
                    <div className="space-y-3 rounded-2xl border border-border-theme bg-white p-4"><div className="flex items-center gap-2"><FolderInput className="h-4 w-4 text-text-secondary" /><p className="text-xs font-bold text-text-primary">本机工具目录</p></div><button type="button" disabled={localImportBusy} onClick={handleImportLocalToolDirs} className="w-full rounded-xl border border-border-theme bg-zinc-50 px-4 py-2.5 text-xs font-bold disabled:opacity-50">{localImportBusy ? '正在读取...' : '从 .gemini / .claude / .codex 导入'}</button>{localImportHint ? <p className="text-[10px] text-text-secondary">{localImportHint}</p> : null}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border-theme bg-zinc-50/50 px-6 py-4"><div className="flex items-center gap-2"><Shield className="h-4 w-4 text-green-500" /><span className="text-[10px] font-medium text-text-secondary">端到端加密存储</span></div><div className="flex items-center gap-3"><AnimatePresence>{showSaved ? <motion.div initial={{opacity: 0, x: 10}} animate={{opacity: 1, x: 0}} exit={{opacity: 0}} className="flex items-center gap-1.5 text-xs font-medium text-green-600"><CheckCircle2 className="h-4 w-4" />设置已保存</motion.div> : null}</AnimatePresence><button onClick={onClose} className="rounded-xl bg-zinc-100 px-5 py-2 text-sm font-medium text-text-primary">取消</button><button onClick={handleSave} className="flex items-center gap-2 rounded-xl bg-accent-theme px-6 py-2 text-sm font-bold text-white"><Save className="h-4 w-4" />保存设置</button></div></div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
