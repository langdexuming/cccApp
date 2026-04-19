import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, ArrowUp, Loader2, Sparkles, Mic, MicOff, History, X, MessageSquare, PanelLeftClose, PanelLeftOpen, ChevronDown, Zap, Brain, Command, Terminal, Globe, Search, Users, Bot, Settings, Bug, CheckCircle2, FileText, Rocket, Box } from 'lucide-react';
import { Message as MessageType, Chat, AppSettings, ProviderType } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { Message } from './Message';
import { ProjectTimeline } from './ProjectTimeline';
import { streamChat, generateTitle } from '../services/chatService';
import { ProjectPhase, Task } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';

const AI_PROMPTS = [
  { icon: <Terminal className="w-3" />, text: "解释这段代码的工作原理", color: "text-blue-600 bg-blue-50/50" },
  { icon: <Zap className="w-3" />, text: "重构并优化这段逻辑", color: "text-amber-600 bg-amber-50/50" },
  { icon: <Bug className="w-3" />, text: "查找并修复潜在的 Bug", color: "text-red-600 bg-red-50/50" },
  { icon: <CheckCircle2 className="w-3" />, text: "为功能编写单元测试", color: "text-emerald-600 bg-emerald-50/50" },
  { icon: <FileText className="w-3" />, text: "添加详细的中文注释", color: "text-purple-600 bg-purple-50/50" },
];

function pickValidModel(
  preferredModel: string | undefined,
  availableModels: string[],
): string {
  if (preferredModel && availableModels.includes(preferredModel)) {
    return preferredModel;
  }
  return availableModels[0] ?? '';
}

interface ChatInterfaceProps {
  chat: Chat | null;
  onUpdateChat: (chat: Chat) => void;
  onNewChat: () => void;
  chats: Chat[];
  onSelectChat: (id: string) => void;
  isSidebarVisible: boolean;
  onToggleSidebar: () => void;
  onIsTypingChange?: (isTyping: boolean) => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onOpenSettings: () => void;
  isDesignPanelOpen: boolean;
  onToggleDesignPanel: () => void;
}

export function ChatInterface({ 
  chat, 
  onUpdateChat, 
  onNewChat, 
  chats, 
  onSelectChat,
  isSidebarVisible,
  onToggleSidebar,
  onIsTypingChange,
  settings,
  onUpdateSettings,
  onOpenSettings,
  isDesignPanelOpen,
  onToggleDesignPanel
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [showModelSearch, setShowModelSearch] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    pickValidModel(chat?.model, settings.providers[settings.activeProvider].models),
  );
  const [selectedEffort, setSelectedEffort] = useState<Chat['effort']>(chat?.effort || 'medium');

  const activeProvider = settings.providers[settings.activeProvider];
  const allModels = activeProvider.models.map(m => ({
    id: m,
    name: m,
    icon: Sparkles,
    desc: ''
  }));

  const models = allModels.filter(m => 
    m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const providerIcons: Record<ProviderType, any> = {
    gemini: Zap,
    claude: Brain,
    openai: Command,
    custom: Globe,
    vertex_ai: Sparkles
  };

  const providers = (Object.values(settings.providers) as any[]).filter(p => p.enabled);

  const efforts = [
    { id: 'low', name: '快速', icon: Zap },
    { id: 'medium', name: '标准', icon: Brain },
    { id: 'high', name: '深度', icon: Command },
  ];

  const commands = [
    { key: '/help', desc: '显示帮助信息', action: () => setInput('请告诉我你可以帮我做什么？') },
    { key: '/clear', desc: '清空当前对话', action: onNewChat },
    { key: '/summarize', desc: '总结当前对话内容', action: () => setInput('请总结一下我们之前的对话内容。') },
    { key: '/translate', desc: '翻译上一条消息', action: () => setInput('请将上一条消息翻译成英文。') },
  ];

  useEffect(() => {
    const preferredModel =
      chat && chat.provider === settings.activeProvider ? chat.model : undefined;
    setSelectedModel(pickValidModel(preferredModel, activeProvider.models));
    if (chat) {
      setSelectedEffort(chat.effort || 'medium');
    }
  }, [activeProvider.models, chat?.effort, chat?.id, chat?.model, chat?.provider, settings.activeProvider]);

  useEffect(() => {
    onIsTypingChange?.(isLoading);
  }, [isLoading, onIsTypingChange]);
  const [isListening, setIsListening] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'zh-CN';

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setInput(prev => prev + finalTranscript);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (error) {
        console.error('Failed to start recognition', error);
      }
    }
  };

  const handlePromptClick = (text: string) => {
    setInput(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Adjust height in next tick
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
      }, 0);
    }
  };

  const scrollToBottom = (force = false) => {
    if (force || autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // Allow some threshold (100px)
      const isAtBottom = scrollHeight - scrollTop <= clientHeight + 100;
      setAutoScroll(isAtBottom);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat?.messages, isLoading]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    
    if (value === '/') {
      setShowCommands(true);
    } else if (!value.startsWith('/') || value.includes(' ')) {
      setShowCommands(false);
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    if (!chat) return;
    const updatedMessages = chat.messages.map(m => 
      m.id === messageId ? { ...m, content: newContent } : m
    );
    onUpdateChat({
      ...chat,
      messages: updatedMessages
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: MessageType = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    let currentChat = chat;
    if (!currentChat) {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: 'New Chat',
        messages: [userMessage],
        updatedAt: Date.now(),
        model: selectedModel,
        provider: settings.activeProvider,
        effort: selectedEffort,
      };
      onUpdateChat(newChat);
      currentChat = newChat;
      
      // Generate title in background
      generateTitle(userMessage.content, settings).then(title => {
        onUpdateChat({ ...newChat, title });
      });
    } else {
      const updatedChat = {
        ...currentChat,
        messages: [...currentChat.messages, userMessage],
        updatedAt: Date.now(),
        model: selectedModel,
        provider: settings.activeProvider,
        effort: selectedEffort,
      };
      onUpdateChat(updatedChat);
      currentChat = updatedChat;
    }

    setInput('');
    setShowCommands(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);
    setErrorMessage(null);
    setAutoScroll(true);
    setTimeout(() => scrollToBottom(true), 100);

    try {
      const assistantMessageId = (Date.now() + 1).toString();
      let assistantContent = '';
      
      const stream = streamChat(currentChat.messages, settings, selectedModel, selectedEffort);
      
      for await (const chunk of stream) {
        assistantContent += chunk;
        onUpdateChat({
          ...currentChat,
          messages: [
            ...currentChat.messages,
            {
              id: assistantMessageId,
              role: 'assistant',
              content: assistantContent,
              timestamp: Date.now(),
            },
          ],
          updatedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-bg-main relative overflow-hidden">
      <div className="absolute top-[15px] right-[20px] text-[10px] text-text-secondary bg-[#F0F0F0] px-2 py-1 rounded">TAURI NATIVE</div>
      
      {/* Header */}
      <header className="h-[60px] border-b border-border-theme flex items-center justify-between px-6 bg-white z-10">
        <div className="flex items-center gap-4 flex-1">
          <button 
            onClick={onToggleSidebar}
            className="group relative p-2 hover:bg-zinc-100 rounded-lg transition-colors text-text-secondary hover:text-text-primary"
            title={isSidebarVisible ? "隐藏侧边栏 (⌘B)" : "显示侧边栏 (⌘B)"}
          >
            {isSidebarVisible ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            <kbd className="absolute -bottom-6 left-1/2 -translate-x-1/2 hidden group-hover:inline-flex h-4 w-7 items-center justify-center rounded border border-zinc-200 bg-white shadow-sm font-mono text-[9px] font-medium text-zinc-400 z-50">
              ⌘B
            </kbd>
          </button>
          <div className="flex items-center gap-2 px-2 py-1 hover:bg-zinc-50 rounded-lg cursor-pointer transition-colors group">
            <h2 className="text-[14px] font-semibold text-text-primary truncate max-w-[150px] md:max-w-xs">
              {chat?.title || '开启新对话'}
            </h2>
            <ChevronDown className="w-3.5 h-3.5 text-text-secondary group-hover:text-text-primary transition-colors" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Provider Selector */}
          <div className="flex items-center bg-zinc-100/80 p-1 rounded-xl gap-1">
            {providers.map((p) => {
              const Icon = providerIcons[p.id as ProviderType] || Globe;
              return (
                <button
                  key={p.id}
                  onClick={() => onUpdateSettings({ ...settings, activeProvider: p.id })}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                    settings.activeProvider === p.id 
                      ? "bg-white text-text-primary shadow-sm" 
                      : "text-text-secondary hover:text-text-primary"
                  )}
                  title={p.name}
                >
                  <Icon className={cn("w-3 h-3", settings.activeProvider === p.id ? "text-accent-theme" : "")} />
                  <span className="hidden lg:inline">{p.name}</span>
                </button>
              );
            })}
          </div>

          <div className="w-px h-4 bg-border-theme mx-1" />

          {/* Model Selector */}
          <div className="flex items-center bg-zinc-100/80 p-1 rounded-xl gap-1">
            <AnimatePresence mode="wait">
              {showModelSearch ? (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 120, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  className="relative flex items-center"
                >
                  <Search className="w-3 h-3 absolute left-2 text-text-secondary" />
                  <input
                    autoFocus
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    onBlur={() => !modelSearch && setShowModelSearch(false)}
                    placeholder="搜索模型..."
                    className="w-full pl-7 pr-2 py-1 bg-white rounded-lg text-[10px] border border-border-theme outline-none focus:border-accent-theme transition-all"
                  />
                </motion.div>
              ) : (
                <button
                  onClick={() => setShowModelSearch(true)}
                  className="p-1.5 hover:bg-white rounded-lg transition-colors text-text-secondary hover:text-text-primary"
                  title="搜索模型"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-1 max-w-[200px] overflow-x-auto no-scrollbar">
              {models.length > 0 ? (
                models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap",
                      selectedModel === m.id 
                        ? "bg-white text-text-primary shadow-sm" 
                        : "text-text-secondary hover:text-text-primary"
                    )}
                    title={m.name}
                  >
                    <m.icon className={cn("w-3 h-3", selectedModel === m.id ? "text-accent-theme" : "")} />
                    <span className="max-w-[140px] truncate">{m.name}</span>
                  </button>
                ))
              ) : (
                <span className="text-[10px] text-text-secondary px-2">无匹配模型</span>
              )}
            </div>
          </div>

          <div className="w-px h-4 bg-border-theme mx-1" />

          {/* Effort Selector */}
          <div className="flex items-center bg-zinc-100/80 p-1 rounded-xl gap-1">
            {efforts.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedEffort(e.id as any)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                  selectedEffort === e.id 
                    ? "bg-white text-text-primary shadow-sm" 
                    : "text-text-secondary hover:text-text-primary"
                )}
                title={`思考程度: ${e.name}`}
              >
                <e.icon className={cn("w-3 h-3", selectedEffort === e.id ? "text-blue-500" : "")} />
                <span className="hidden xl:inline">{e.name}</span>
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-border-theme mx-1" />

          {/* Collaboration Indicator */}
          <button
            onClick={() => onUpdateSettings({
              ...settings,
              collaboration: { 
                ...(settings.collaboration || DEFAULT_SETTINGS.collaboration), 
                enabled: !(settings.collaboration?.enabled) 
              }
            })}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
              settings.collaboration?.enabled 
                ? "bg-orange-50 text-accent-theme shadow-sm border border-orange-100" 
                : "text-text-secondary hover:text-text-primary bg-zinc-100/80"
            )}
            title={settings.collaboration?.enabled ? "关闭多代理协同" : "开启多代理协同"}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">协同模式</span>
          </button>

          <div className="w-px h-4 bg-border-theme mx-1" />

          <button 
            onClick={() => setShowHistory(true)}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-text-secondary hover:text-text-primary"
            title="查看历史"
          >
            <History className="w-5 h-5" />
          </button>

          <div className="w-px h-4 bg-border-theme mx-1" />

          {/* Toggle Design Panel (Claude Artifacts style) */}
          <button 
            onClick={onToggleDesignPanel}
            className={cn(
              "p-2 rounded-lg transition-all flex items-center gap-2",
              isDesignPanelOpen ? "bg-accent-theme text-white shadow-sm" : "hover:bg-zinc-100 text-text-secondary"
            )}
            title={isDesignPanelOpen ? "收起设计面板" : "展开设计面板 (Artifacts)"}
          >
            <Rocket className={cn("w-5 h-5", isDesignPanelOpen && "animate-pulse")} />
          </button>
        </div>
      </header>

      {/* History Slide-out Panel */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 w-80 h-full bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-4 border-b border-border-theme flex items-center justify-between">
                <h3 className="font-semibold text-text-primary">聊天历史</h3>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-1 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-text-secondary" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {chats.length === 0 ? (
                  <div className="p-8 text-center text-sm text-text-secondary italic">
                    暂无历史记录
                  </div>
                ) : (
                  chats
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          onSelectChat(item.id);
                          setShowHistory(false);
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-xl transition-all group flex items-start gap-3",
                          chat?.id === item.id 
                            ? "bg-orange-50 border border-orange-100" 
                            : "hover:bg-zinc-50 border border-transparent"
                        )}
                      >
                        <MessageSquare className={cn(
                          "w-4 h-4 mt-0.5 flex-shrink-0",
                          chat?.id === item.id ? "text-orange-500" : "text-text-secondary"
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "text-sm font-medium truncate",
                            chat?.id === item.id ? "text-orange-900" : "text-text-primary"
                          )}>
                            {item.title}
                          </div>
                          <div className="text-[10px] text-text-secondary mt-0.5">
                            {formatDistanceToNow(item.updatedAt, { addSuffix: true })}
                          </div>
                        </div>
                      </button>
                    ))
                )}
              </div>
              <div className="p-4 border-t border-border-theme">
                <button 
                  onClick={() => {
                    onNewChat();
                    setShowHistory(false);
                  }}
                  className="w-full py-2 bg-accent-theme text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  开启新对话
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-[15%] pt-10 pb-5"
      >
        {!chat || chat.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center"
            >
              <BotIcon className="w-10 h-10 text-accent-theme" />
            </motion.div>
            <div className="space-y-2 max-w-sm">
              <h1 className="text-2xl font-semibold text-text-primary">今天我能帮您什么？</h1>
              <p className="text-text-secondary">
                我是 Claude，一个由 Anthropic 构建的 AI 助手，旨在提供安全、准确和有用的帮助。
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col pb-40">
            {settings.collaboration.enabled && (
              <ProjectTimeline 
                currentPhase={chat.currentPhase || 'planning'}
                tasks={chat.tasks || []}
                onUpdatePhase={(phase) => {
                  onUpdateChat({ ...chat, currentPhase: phase });
                }}
                onAddTask={() => {
                  const title = prompt('输入新任务名称:');
                  if (title) {
                    const newTask: Task = {
                      id: Date.now().toString(),
                      title,
                      status: 'todo',
                      assigneeId: 'pm',
                      phase: chat.currentPhase || 'planning'
                    };
                    onUpdateChat({ ...chat, tasks: [...(chat.tasks || []), newTask] });
                  }
                }}
              />
            )}
            {chat.messages.map((msg) => (
              <Message key={msg.id} message={msg} onEdit={handleEditMessage} />
            ))}
            {errorMessage && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-6 bg-red-50 border border-red-100 rounded-3xl flex items-start gap-4 shadow-sm"
              >
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <X className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="text-base font-bold text-red-900">请求失败</div>
                  <div className="text-sm text-red-700 font-medium leading-relaxed">
                    {errorMessage}
                  </div>
                  <button 
                    onClick={() => onOpenSettings()}
                    className="mt-2 px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-colors flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    立即前往设置
                  </button>
                </div>
              </motion.div>
            )}
            {isLoading && chat.messages[chat.messages.length - 1].role === 'user' && (
              <div className="mb-8 flex gap-5">
                <div className="flex-shrink-0">
                  <div className="w-6 h-6 rounded bg-accent-theme flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-12 bg-zinc-100 rounded animate-pulse" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 px-4 md:px-[10%] pb-8 bg-gradient-to-t from-bg-main via-bg-main/95 to-transparent pt-20 z-20">
        <div className="max-w-3xl mx-auto relative group">
          {/* AI Prompts / Feature Hints */}
          {!input.trim() && !isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none no-scrollbar justify-center"
            >
              {AI_PROMPTS.slice(0, 3).map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePromptClick(prompt.text)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium bg-white border border-border-theme hover:border-accent-theme/30 hover:shadow-md transition-all active:scale-95 whitespace-nowrap text-text-primary"
                >
                  <span className="opacity-70">{prompt.icon}</span>
                  {prompt.text}
                </button>
              ))}
            </motion.div>
          )}

          {/* Shortcut Commands Menu */}
          <AnimatePresence>
            {showCommands && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full mb-4 left-0 w-64 bg-white border border-border-theme rounded-2xl shadow-2xl overflow-hidden z-50 p-2"
              >
                <div className="px-3 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-widest border-b border-zinc-50 mb-1 flex items-center gap-2">
                  <Terminal className="w-3 h-3" />
                  快捷命令
                </div>
                {commands.map((cmd) => (
                  <button
                    key={cmd.key}
                    onClick={() => {
                      cmd.action();
                      setShowCommands(false);
                      textareaRef.current?.focus();
                    }}
                    className="w-full flex flex-col items-start px-3 py-2.5 hover:bg-zinc-50 rounded-xl transition-colors text-left group"
                  >
                    <span className="text-sm font-bold text-accent-theme">{cmd.key}</span>
                    <span className="text-[11px] text-text-secondary font-medium">{cmd.desc}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            layout
            className={cn(
              "relative flex flex-col p-4 bg-white border border-border-theme rounded-2xl transition-all duration-300 ease-out min-h-[120px]",
              "shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
              "focus-within:shadow-[0_20px_40px_rgba(0,0,0,0.08)] focus-within:border-accent-theme/40",
              input.trim() ? "border-accent-theme/20 shadow-[0_12px_40px_rgba(217,119,87,0.08)]" : ""
            )}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="在这里输入您的问题..."
              className="flex-1 bg-transparent border-0 focus:ring-0 resize-none py-2 px-1 text-text-primary placeholder-zinc-400 text-[15px] leading-relaxed"
            />
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-50">
              <div className="flex gap-1 items-center">
                <div className="relative group/upload">
                  <button className="p-2 text-text-secondary hover:text-text-primary hover:bg-zinc-50 rounded-xl transition-all active:scale-95 flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4" />
                    <span className="text-[10px] font-bold text-zinc-400 group-hover/upload:text-accent-theme transition-colors">DOCX/PPTX/XLSX</span>
                  </button>
                  {/* Floating format hint */}
                  <div className="absolute bottom-full mb-2 left-0 opacity-0 group-hover/upload:opacity-100 transition-all pointer-events-none translate-y-2 group-hover/upload:translate-y-0">
                    <div className="bg-text-primary text-white px-3 py-1.5 rounded-lg text-[9px] font-bold shadow-xl whitespace-nowrap flex items-center gap-2">
                      <Box className="w-3 h-3 text-accent-theme" />
                      支持全量文档/网页资产抓取
                    </div>
                  </div>
                </div>
                <div className="w-px h-4 bg-zinc-100 mx-1" />
                <button 
                  onClick={toggleListening}
                  className={cn(
                    "p-2 rounded-xl transition-all active:scale-95",
                    isListening ? "text-red-500 bg-red-50" : "text-text-secondary hover:text-text-primary hover:bg-zinc-50"
                  )}
                  title="语音输入 / 手谈标注"
                >
                  {isListening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                {input.length > 0 && (
                  <span className="text-[10px] font-medium text-text-secondary/40 tabular-nums">
                    {input.length}
                  </span>
                )}
                <button
                  onClick={() => handleSubmit()}
                  disabled={!input.trim() || isLoading}
                  className={cn(
                    "w-10 h-10 rounded-xl transition-all flex items-center justify-center group",
                    input.trim() && !isLoading
                      ? "bg-accent-theme text-white shadow-lg shadow-accent-theme/20 hover:scale-105 active:scale-95"
                      : "bg-[#F3F3F2] text-zinc-300"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-accent-theme" />
                  ) : (
                    <ArrowUp className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
          <p className="mt-4 text-center text-[10px] text-zinc-400 font-medium">
            项目全生命周期设计系统 · 由 Gemini & Vertex AI 提供支持
          </p>
        </div>
      </div>
    </div>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}
