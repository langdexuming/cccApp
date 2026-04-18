import { useState, useEffect } from 'react';
import { X, Save, Globe, Key, Shield, Info, CheckCircle2, Plus, Trash2, Cpu, FolderInput, Users, GitBranch, Layout, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppSettings, ProviderType, ProviderConfig } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { cn } from '../lib/utils';
import {
  fetchLocalToolConfig,
  mergeLocalToolConfigIntoSettings,
} from '../lib/mergeLocalToolConfig';

const PROVIDER_MODEL_OPTIONS: Record<ProviderType, string[]> = {
  gemini: [
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  claude: [
    'claude-3-7-sonnet-latest',
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  openai: [
    'gpt-5.4',
    'gpt-5',
    'gpt-5-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo-preview',
    'gpt-4',
    'gpt-3.5-turbo',
  ],
  custom: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'deepseek-chat',
    'deepseek-reasoner',
    'qwen-max',
    'qwen-plus',
    'glm-4.5',
    'claude-3-7-sonnet-latest',
  ],
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

export function SettingsModal({ isOpen, onClose, settings, onSave }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [gitConfig, setGitConfig] = useState(settings.git || DEFAULT_SETTINGS.git);
  const [activeTab, setActiveTab] = useState<ProviderType | 'collaboration' | 'git'>('gemini');
  const [showSaved, setShowSaved] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [selectedPresetModel, setSelectedPresetModel] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [localImportHint, setLocalImportHint] = useState<string | null>(null);
  const [localImportBusy, setLocalImportBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
      setGitConfig(settings.git || DEFAULT_SETTINGS.git);
      setSelectedPresetModel('');
      setLocalImportHint(null);
    }
  }, [isOpen, settings]);

  useEffect(() => {
    setNewModelName('');
    setSelectedPresetModel('');
    setModelFilter('');
  }, [activeTab]);

  const handleImportLocalToolDirs = async () => {
    setLocalImportBusy(true);
    setLocalImportHint(null);
    const data = await fetchLocalToolConfig();
    setLocalImportBusy(false);
    if (!data?.ok) {
      setLocalImportHint(
        data?.error
          ? `读取失败：${data.error}`
          : '无法读取本机目录。请使用 npm run dev 或 npm run preview 启动；纯静态托管环境不支持。',
      );
      return;
    }
    if (data.sources.length === 0) {
      setLocalImportHint(
        '未发现可用项。将检查 ~/.gemini/.env、~/.claude/settings*.json、~/.codex/config.toml 与 auth.json 等。',
      );
    } else {
      setLocalImportHint(
        `已从 ${data.sources.length} 个文件合并（仅写入仍为空的 API Key，Base URL 仅在内置默认时可被覆盖）。`,
      );
    }
    setLocalSettings((prev) => mergeLocalToolConfigIntoSettings(prev, data));
  };

  const handleSave = () => {
    const finalSettings = {
      ...localSettings,
      git: gitConfig
    };
    onSave(finalSettings);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  const updateProvider = (id: ProviderType, updates: Partial<ProviderConfig>) => {
    setLocalSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [id]: { ...prev.providers[id], ...updates }
      }
    }));
  };

  const updateCollaboration = (updates: Partial<AppSettings['collaboration']>) => {
    setLocalSettings(prev => ({
      ...prev,
      collaboration: { 
        ...(prev.collaboration || DEFAULT_SETTINGS.collaboration), 
        ...updates 
      }
    }));
  };

  const updateGit = (updates: Partial<AppSettings['git']>) => {
    setLocalSettings(prev => ({
      ...prev,
      git: { 
        ...(prev.git || DEFAULT_SETTINGS.git), 
        ...updates 
      }
    }));
  };

  const addModel = (modelName?: string) => {
    if (activeTab === 'collaboration' || activeTab === 'git') return;
    const provider = activeTab as ProviderType;
    const value = (modelName ?? newModelName).trim();
    if (!value) return;
    const currentModels = localSettings.providers[provider].models;
    if (currentModels.includes(value)) return;
    
    updateProvider(provider, {
      models: [...currentModels, value]
    });
    setNewModelName('');
    if (selectedPresetModel === value) {
      setSelectedPresetModel('');
    }
  };

  const removeModel = (modelName: string) => {
    if (activeTab === 'collaboration' || activeTab === 'git') return;
    const provider = activeTab as ProviderType;
    const currentModels = localSettings.providers[provider].models;
    updateProvider(provider, {
      models: currentModels.filter(m => m !== modelName)
    });
  };

  const isProviderTab = activeTab !== 'collaboration' && activeTab !== 'git';
  const currentProvider = isProviderTab ? activeTab as ProviderType : 'gemini';

  const availablePresetModels = isProviderTab 
    ? PROVIDER_MODEL_OPTIONS[currentProvider].filter(
        (model) => !localSettings.providers[currentProvider].models.includes(model),
      )
    : [];
  const quickAddModels = availablePresetModels.slice(0, 8);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="p-6 border-b border-border-theme flex items-center justify-between bg-zinc-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-theme/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-accent-theme" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-text-primary">模型接入设置</h2>
                <p className="text-xs text-text-secondary">配置您的 API 密钥和自定义端点</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar Tabs */}
            <div className="w-48 border-r border-border-theme bg-zinc-50/30 p-3 flex flex-col gap-1">
              <div className="px-3 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">模型提供商</div>
              {(Object.keys(localSettings.providers) as ProviderType[]).map((id) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-3",
                    activeTab === id 
                      ? "bg-white text-accent-theme shadow-sm border border-border-theme" 
                      : "text-text-secondary hover:text-text-primary hover:bg-zinc-100"
                  )}
                >
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    localSettings.providers[id].apiKey ? "bg-green-500" : "bg-zinc-300"
                  )} />
                  {localSettings.providers[id].name}
                </button>
              ))}

              <div className="mt-4 px-3 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">扩展功能</div>
              <button
                onClick={() => setActiveTab('collaboration')}
                className={cn(
                  "w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-3",
                  activeTab === 'collaboration' 
                    ? "bg-white text-accent-theme shadow-sm border border-border-theme" 
                    : "text-text-secondary hover:text-text-primary hover:bg-zinc-100"
                )}
              >
                <Users className="w-4 h-4" />
                多代理协同
              </button>
              <button
                onClick={() => setActiveTab('git')}
                className={cn(
                  "w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-3",
                  activeTab === 'git' 
                    ? "bg-white text-accent-theme shadow-sm border border-border-theme" 
                    : "text-text-secondary hover:text-text-primary hover:bg-zinc-100"
                )}
              >
                <GitBranch className="w-4 h-4" />
                Git 管理
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {activeTab === 'collaboration' ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">多代理协同配置</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-text-secondary">启用协同模式</span>
                      <button
                        onClick={() => updateCollaboration({ enabled: !(localSettings.collaboration?.enabled) })}
                        className={cn(
                          "w-8 h-4 rounded-full transition-colors relative",
                          localSettings.collaboration?.enabled ? "bg-accent-theme" : "bg-zinc-200"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                          localSettings.collaboration?.enabled ? "left-4.5" : "left-0.5"
                        )} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {(localSettings.collaboration?.agents || DEFAULT_SETTINGS.collaboration.agents).map((agent, idx) => (
                      <div key={agent.id} className="p-4 bg-zinc-50 border border-border-theme rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-accent-theme" />
                            <span className="text-sm font-bold text-text-primary">{agent.name}</span>
                          </div>
                          <button
                            onClick={() => {
                              const currentAgents = localSettings.collaboration?.agents || DEFAULT_SETTINGS.collaboration.agents;
                              const newAgents = [...currentAgents];
                              newAgents[idx] = { ...agent, enabled: !agent.enabled };
                              updateCollaboration({ agents: newAgents });
                            }}
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors",
                              agent.enabled ? "bg-green-100 text-green-700" : "bg-zinc-200 text-zinc-500"
                            )}
                          >
                            {agent.enabled ? '已启用' : '已禁用'}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-text-secondary uppercase">模型提供商</label>
                            <select 
                              value={agent.provider}
                              onChange={(e) => {
                                const currentAgents = localSettings.collaboration?.agents || DEFAULT_SETTINGS.collaboration.agents;
                                const newAgents = [...currentAgents];
                                newAgents[idx] = { ...agent, provider: e.target.value as any };
                                updateCollaboration({ agents: newAgents });
                              }}
                              className="w-full px-3 py-1.5 bg-white border border-border-theme rounded-lg text-xs"
                            >
                              {Object.keys(localSettings.providers).map(p => (
                                <option key={p} value={p}>{localSettings.providers[p as ProviderType].name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-text-secondary uppercase">角色</label>
                            <input 
                              value={agent.role}
                              onChange={(e) => {
                                const currentAgents = localSettings.collaboration?.agents || DEFAULT_SETTINGS.collaboration.agents;
                                const newAgents = [...currentAgents];
                                newAgents[idx] = { ...agent, role: e.target.value };
                                updateCollaboration({ agents: newAgents });
                              }}
                              className="w-full px-3 py-1.5 bg-white border border-border-theme rounded-lg text-xs"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-text-secondary uppercase">系统提示词</label>
                          <textarea 
                            value={agent.systemPrompt}
                            onChange={(e) => {
                              const currentAgents = localSettings.collaboration?.agents || DEFAULT_SETTINGS.collaboration.agents;
                              const newAgents = [...currentAgents];
                              newAgents[idx] = { ...agent, systemPrompt: e.target.value };
                              updateCollaboration({ agents: newAgents });
                            }}
                            rows={2}
                            className="w-full px-3 py-1.5 bg-white border border-border-theme rounded-lg text-xs resize-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeTab === 'git' ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Git 版本管理</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-text-secondary">启用 Git 同步</span>
                      <button
                        onClick={() => setGitConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                        className={cn(
                          "w-8 h-4 rounded-full transition-colors relative",
                          gitConfig.enabled ? "bg-accent-theme" : "bg-zinc-200"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                          gitConfig.enabled ? "left-4.5" : "left-0.5"
                        )} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-text-secondary flex items-center gap-2">
                        <Globe className="w-3 h-3" />
                        远程仓库地址
                      </label>
                      <input
                        type="text"
                        value={gitConfig.repoUrl || ''}
                        onChange={(e) => setGitConfig(prev => ({ ...prev, repoUrl: e.target.value }))}
                        placeholder="https://github.com/user/repo.git"
                        className="w-full px-4 py-2.5 bg-zinc-50 border border-border-theme rounded-xl text-sm outline-none focus:border-accent-theme"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-text-secondary flex items-center gap-2">
                        <GitBranch className="w-3 h-3" />
                        分支
                      </label>
                      <input
                        type="text"
                        value={gitConfig.branch || 'main'}
                        onChange={(e) => setGitConfig(prev => ({ ...prev, branch: e.target.value }))}
                        placeholder="main"
                        className="w-full px-4 py-2.5 bg-zinc-50 border border-border-theme rounded-xl text-sm outline-none focus:border-accent-theme"
                      />
                    </div>
                    
                    <button 
                      onClick={() => {
                        updateGit(gitConfig);
                        handleSave();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-theme/10 text-accent-theme hover:bg-accent-theme/20 rounded-xl text-xs font-bold transition-all active:scale-95 border border-accent-theme/20"
                    >
                      <Save className="w-4 h-4" />
                      应用并保存 Git 配置
                    </button>
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => alert('Git Pull 功能需要 Tauri 后端支持')}
                      className="flex-1 py-3 bg-zinc-50 hover:bg-zinc-100 border border-border-theme text-zinc-900 rounded-xl text-xs font-bold transition-all active:scale-95"
                    >
                      拉取 (Pull)
                    </button>
                    <button 
                      onClick={() => alert('Git Push 功能需要 Tauri 后端支持')}
                      className="flex-1 py-3 bg-zinc-50 hover:bg-zinc-100 border border-border-theme text-zinc-900 rounded-xl text-xs font-bold transition-all active:scale-95"
                    >
                      推送 (Push)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                      {localSettings.providers[activeTab as ProviderType].name} 配置
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-text-secondary">启用此提供商</span>
                      <button
                        onClick={() => updateProvider(activeTab as ProviderType, { enabled: !localSettings.providers[activeTab as ProviderType].enabled })}
                        className={cn(
                          "w-8 h-4 rounded-full transition-colors relative",
                          localSettings.providers[activeTab as ProviderType].enabled ? "bg-accent-theme" : "bg-zinc-200"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                          localSettings.providers[activeTab as ProviderType].enabled ? "left-4.5" : "left-0.5"
                        )} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary flex items-center gap-2">
                      <Key className="w-3 h-3" />
                      API Key
                    </label>
                    <input
                      type="password"
                      value={localSettings.providers[currentProvider].apiKey}
                      onChange={(e) => updateProvider(currentProvider, { apiKey: e.target.value })}
                      placeholder={`输入您的 ${localSettings.providers[currentProvider].name} API Key`}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-border-theme rounded-xl text-sm focus:ring-4 focus:ring-accent-theme/5 focus:border-accent-theme transition-all outline-none"
                    />
                  </div>

                  {isProviderTab && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-text-secondary flex items-center gap-2">
                        <Globe className="w-3 h-3" />
                        API 地址 (Base URL)
                      </label>
                      <input
                        type="text"
                        value={localSettings.providers[currentProvider].baseUrl || ''}
                        onChange={(e) => updateProvider(currentProvider, { baseUrl: e.target.value })}
                        placeholder={
                          currentProvider === 'gemini'
                            ? 'https://generativelanguage.googleapis.com'
                            : currentProvider === 'claude'
                              ? 'https://api.anthropic.com/v1'
                              : 'https://api.openai.com/v1'
                        }
                        className="w-full px-4 py-2.5 bg-zinc-50 border border-border-theme rounded-xl text-sm focus:ring-4 focus:ring-accent-theme/5 focus:border-accent-theme transition-all outline-none"
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-text-secondary flex items-center gap-2">
                      <Cpu className="w-3 h-3" />
                      模型管理
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newModelName}
                        onChange={(e) => setNewModelName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addModel()}
                        placeholder="输入模型 ID (如: gpt-4o)"
                        className="flex-1 px-4 py-2 bg-zinc-50 border border-border-theme rounded-xl text-sm focus:ring-4 focus:ring-accent-theme/5 focus:border-accent-theme transition-all outline-none"
                      />
                      <button
                        onClick={() => addModel()}
                        className="px-4 py-2 bg-zinc-100 text-text-primary rounded-xl text-sm font-bold hover:bg-zinc-200 transition-all active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={selectedPresetModel}
                        onChange={(e) => setSelectedPresetModel(e.target.value)}
                        className="flex-1 px-4 py-2 bg-zinc-50 border border-border-theme rounded-xl text-sm focus:ring-4 focus:ring-accent-theme/5 focus:border-accent-theme transition-all outline-none"
                      >
                        <option value="">从常用模型中选择...</option>
                        {availablePresetModels.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => addModel(selectedPresetModel)}
                        disabled={!selectedPresetModel}
                        className="px-4 py-2 bg-white border border-border-theme text-text-primary rounded-xl text-sm font-bold hover:bg-zinc-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        添加选中
                      </button>
                    </div>
                    {quickAddModels.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-medium text-text-secondary">常用模型快速添加</p>
                        <div className="flex flex-wrap gap-2">
                          {quickAddModels.map((model) => (
                            <button
                              key={model}
                              type="button"
                              onClick={() => addModel(model)}
                              className="px-3 py-1.5 bg-white border border-border-theme rounded-lg text-xs font-medium text-text-primary hover:border-accent-theme hover:text-accent-theme transition-colors"
                            >
                              {model}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <div className="w-full mb-1">
                        <input
                          type="text"
                          value={modelFilter}
                          onChange={(e) => setModelFilter(e.target.value)}
                          placeholder="筛选已添加的模型..."
                          className="w-full px-3 py-1.5 bg-zinc-50 border border-border-theme rounded-lg text-[10px] outline-none focus:border-accent-theme transition-all"
                        />
                      </div>
                      {localSettings.providers[currentProvider].models
                        .filter(m => m.toLowerCase().includes(modelFilter.toLowerCase()))
                        .map((model) => (
                        <div 
                          key={model}
                          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-border-theme rounded-lg text-xs font-medium text-text-primary group"
                        >
                          {model}
                          <button 
                            onClick={() => removeModel(model)}
                            className="p-0.5 hover:bg-red-50 hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex gap-3">
                    <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-[11px] text-blue-900 font-medium">安全提示</p>
                      <p className="text-[10px] text-blue-800/70 leading-relaxed">
                        您的 API Key 将仅保存在本地浏览器缓存中。请确保在受信任的设备上使用。
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-50 rounded-2xl border border-border-theme space-y-3">
                    <div className="flex items-center gap-2">
                      <FolderInput className="w-4 h-4 text-text-secondary" />
                      <p className="text-xs font-bold text-text-primary">本机工具目录</p>
                    </div>
                    <p className="text-[10px] text-text-secondary leading-relaxed">
                      从用户目录下的 .gemini、.claude、.codex（以及环境变量 CODEX_HOME）读取与 CLI
                      一致的配置。启动应用时需使用 Vite 开发或 preview 服务，以便在本地 Node 中访问这些路径。
                    </p>
                    <button
                      type="button"
                      disabled={localImportBusy}
                      onClick={handleImportLocalToolDirs}
                      className="w-full px-4 py-2.5 rounded-xl text-xs font-bold border border-border-theme bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
                    >
                      {localImportBusy ? '正在读取…' : '从 .gemini / .claude / .codex 导入'}
                    </button>
                    {localImportHint ? (
                      <p className="text-[10px] text-text-secondary leading-relaxed">{localImportHint}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

          {/* Footer */}
          <div className="p-4 border-t border-border-theme bg-zinc-50/50 flex items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              <span className="text-[10px] font-medium text-text-secondary">端到端加密存储</span>
            </div>
            <div className="flex items-center gap-3">
              <AnimatePresence>
                {showSaved && (
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 text-green-600 text-xs font-medium"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    已保存
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2 bg-accent-theme text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-accent-theme/20"
              >
                <Save className="w-4 h-4" />
                保存设置
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
