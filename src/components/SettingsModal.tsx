import { useState } from 'react';
import { X, Save, Globe, Key, Shield, Info, CheckCircle2, Plus, Trash2, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppSettings, ProviderType, ProviderConfig } from '../types';
import { cn } from '../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

export function SettingsModal({ isOpen, onClose, settings, onSave }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<ProviderType>('gemini');
  const [showSaved, setShowSaved] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [modelFilter, setModelFilter] = useState('');

  const handleSave = () => {
    onSave(localSettings);
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

  const addModel = () => {
    if (!newModelName.trim()) return;
    const currentModels = localSettings.providers[activeTab].models;
    if (currentModels.includes(newModelName.trim())) return;
    
    updateProvider(activeTab, {
      models: [...currentModels, newModelName.trim()]
    });
    setNewModelName('');
  };

  const removeModel = (modelName: string) => {
    const currentModels = localSettings.providers[activeTab].models;
    updateProvider(activeTab, {
      models: currentModels.filter(m => m !== modelName)
    });
  };

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
            <div className="w-48 border-r border-border-theme bg-zinc-50/30 p-3 space-y-1">
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
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                    {localSettings.providers[activeTab].name} 配置
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-text-secondary">启用此提供商</span>
                    <button
                      onClick={() => updateProvider(activeTab, { enabled: !localSettings.providers[activeTab].enabled })}
                      className={cn(
                        "w-8 h-4 rounded-full transition-colors relative",
                        localSettings.providers[activeTab].enabled ? "bg-accent-theme" : "bg-zinc-200"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                        localSettings.providers[activeTab].enabled ? "left-4.5" : "left-0.5"
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
                      value={localSettings.providers[activeTab].apiKey}
                      onChange={(e) => updateProvider(activeTab, { apiKey: e.target.value })}
                      placeholder={`输入您的 ${localSettings.providers[activeTab].name} API Key`}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-border-theme rounded-xl text-sm focus:ring-4 focus:ring-accent-theme/5 focus:border-accent-theme transition-all outline-none"
                    />
                  </div>

                  {(activeTab === 'claude' || activeTab === 'openai' || activeTab === 'custom') && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-text-secondary flex items-center gap-2">
                        <Globe className="w-3 h-3" />
                        API 地址 (Base URL)
                      </label>
                      <input
                        type="text"
                        value={localSettings.providers[activeTab].baseUrl || ''}
                        onChange={(e) => updateProvider(activeTab, { baseUrl: e.target.value })}
                        placeholder={activeTab === 'claude' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'}
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
                        onClick={addModel}
                        className="px-4 py-2 bg-zinc-100 text-text-primary rounded-xl text-sm font-bold hover:bg-zinc-200 transition-all active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
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
                      {localSettings.providers[activeTab].models
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
                </div>
              </div>
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
