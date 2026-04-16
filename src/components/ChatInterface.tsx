import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, ArrowUp, Loader2, Sparkles, Mic, MicOff, History, X, MessageSquare, PanelLeftClose, PanelLeftOpen, ChevronDown, Zap, Brain, Command, Terminal, Globe, Search } from 'lucide-react';
import { Message as MessageType, Chat, AppSettings, ProviderType } from '../types';
import { Message } from './Message';
import { streamChat, generateTitle } from '../services/chatService';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';

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
  onUpdateSettings
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [showModelSearch, setShowModelSearch] = useState(false);
  const [selectedModel, setSelectedModel] = useState(chat?.model || settings.providers[settings.activeProvider].models[0]);
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
    custom: Globe
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
    if (chat) {
      setSelectedModel(chat.model || settings.providers[settings.activeProvider].models[0]);
      setSelectedEffort(chat.effort || 'medium');
    }
  }, [chat?.id, settings.activeProvider]);

  useEffect(() => {
    onIsTypingChange?.(isLoading);
  }, [isLoading, onIsTypingChange]);
  const [isListening, setIsListening] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-text-secondary hover:text-text-primary"
            title={isSidebarVisible ? "隐藏侧边栏" : "显示侧边栏"}
          >
            {isSidebarVisible ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
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
                  >
                    <m.icon className={cn("w-3 h-3", selectedModel === m.id ? "text-accent-theme" : "")} />
                    <span>{m.name.split('-').slice(-1)[0].toUpperCase()}</span>
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

          <button 
            onClick={() => setShowHistory(true)}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-text-secondary hover:text-text-primary"
            title="查看历史"
          >
            <History className="w-5 h-5" />
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
      <div className="flex-1 overflow-y-auto px-[15%] pt-10 pb-5">
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
            {chat.messages.map((msg) => (
              <Message key={msg.id} message={msg} />
            ))}
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
      <div className="absolute bottom-0 left-0 right-0 px-[15%] pb-10 bg-gradient-to-t from-white via-white/90 to-transparent pt-10">
        <div className="max-w-3xl mx-auto relative">
          {/* Shortcut Commands Menu */}
          <AnimatePresence>
            {showCommands && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full mb-4 left-0 w-64 bg-white border border-border-theme rounded-2xl shadow-2xl overflow-hidden z-50 p-2"
              >
                <div className="px-3 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-zinc-50 mb-1 flex items-center gap-2">
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
                    className="w-full flex flex-col items-start px-3 py-2 hover:bg-zinc-50 rounded-xl transition-colors text-left group"
                  >
                    <span className="text-sm font-bold text-accent-theme group-hover:scale-105 transition-transform">{cmd.key}</span>
                    <span className="text-[11px] text-text-secondary">{cmd.desc}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            layout
            initial={false}
            className={cn(
              "relative flex flex-col p-4 bg-white border rounded-2xl transition-all duration-300 ease-out min-h-[100px]",
              "shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_4px_6px_-2px_rgba(0,0,0,0.05)]",
              "hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)]",
              "focus-within:border-accent-theme focus-within:ring-4 focus-within:ring-accent-theme/5 focus-within:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]",
              input.trim() ? "border-accent-theme/30" : "border-border-theme"
            )}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="输入消息以继续对话..."
              className="flex-1 bg-transparent border-0 focus:ring-0 resize-none py-0 text-text-primary placeholder-text-secondary text-base leading-relaxed"
            />
            <div className="flex justify-between items-center mt-4 pt-2 border-t border-zinc-50">
              <div className="flex gap-1 items-center">
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-zinc-50 rounded-lg transition-all active:scale-95">
                  <Paperclip className="w-4 h-4" />
                  <span className="hidden sm:inline">附件</span>
                </button>
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-zinc-50 rounded-lg transition-all active:scale-95">
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">提示词库</span>
                </button>
                <button 
                  onClick={toggleListening}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-all rounded-lg active:scale-95",
                    isListening ? "text-red-500 bg-red-50" : "text-text-secondary hover:text-text-primary hover:bg-zinc-50"
                  )}
                >
                  {isListening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
                  <span className="hidden sm:inline">{isListening ? '正在录音...' : '语音输入'}</span>
                </button>
                {input.length > 0 && (
                  <motion.span 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="ml-2 text-[10px] font-medium text-text-secondary/50 tabular-nums"
                  >
                    {input.length} 字符
                  </motion.span>
                )}
              </div>
              
              <AnimatePresence mode="wait">
                <motion.button
                  key={input.trim() ? 'send' : 'empty'}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => handleSubmit()}
                  disabled={!input.trim() || isLoading}
                  className={cn(
                    "px-5 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2",
                    input.trim() && !isLoading
                      ? "bg-accent-theme text-white shadow-lg shadow-accent-theme/20 hover:translate-y-[-1px] active:translate-y-[1px]"
                      : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>发送</span>
                      <ArrowUp className="w-4 h-4" />
                    </>
                  )}
                </motion.button>
              </AnimatePresence>
            </div>
          </motion.div>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 text-center text-[10px] text-text-secondary/60"
          >
            Claude 可能会犯错。请核实重要信息。
          </motion.p>
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
