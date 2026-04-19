import { Plus, MessageSquare, Search, Settings, User, GitBranch, Trash2, ChevronDown, Folder, Lightbulb, Sparkles, ChevronRight, Bot } from 'lucide-react';
import { Chat } from '../types';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Pet } from './Pet';
import { useState, useMemo } from 'react';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  isTyping?: boolean;
  onOpenSettings?: () => void;
  onOpenAnalyst?: () => void;
}

export function Sidebar({ chats, activeChatId, onSelectChat, onNewChat, onDeleteChat, isTyping, onOpenSettings, onOpenAnalyst }: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const groupedChats = useMemo(() => {
    const groups: Record<string, Chat[]> = {};
    
    chats.forEach(chat => {
      const workspace = chat.workspace || '本地 / 未分组';
      if (!groups[workspace]) {
        groups[workspace] = [];
      }
      groups[workspace].push(chat);
    });

    // Sort chats within each group
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => b.updatedAt - a.updatedAt);
    });

    return groups;
  }, [chats]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: prev[group] === false ? true : false
    }));
  };

  return (
    <div className="w-[280px] h-full bg-bg-sidebar border-r border-border-theme flex flex-col">
      <div className="p-4 pt-6">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-between p-2.5 px-4 bg-white border border-border-theme rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md transition-all group font-bold text-sm text-text-primary"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-accent-theme" />
            开启新对话
          </div>
          <Bot className="w-4 h-4 text-zinc-300 group-hover:text-accent-theme transition-colors" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-6 pb-4 scrollbar-none">
        {chats.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <MessageSquare className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
            <p className="text-xs text-text-secondary font-medium">暂无历史记录</p>
          </div>
        ) : (
          Object.entries(groupedChats).sort(([a], [b]) => a === '本地 / 未分组' ? 1 : b === '本地 / 未分组' ? -1 : a.localeCompare(b)).map(([workspace, groupChats]) => (
            <div key={workspace} className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-zinc-300" />
                {workspace}
              </div>
              
              <div className="space-y-0.5">
                {groupChats.map((chat) => (
                  <div key={chat.id} className="relative group">
                    <button
                      onClick={() => onSelectChat(chat.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-xl flex flex-col gap-0.5 transition-all",
                        activeChatId === chat.id
                          ? "bg-white shadow-sm border border-border-theme"
                          : "hover:bg-zinc-200/50 border border-transparent"
                      )}
                    >
                      <div className="text-[14px] font-medium text-text-primary truncate pr-5">
                        {chat.title}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-medium tracking-tight">
                        {formatDistanceToNow(chat.updatedAt, { addSuffix: true })}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('确定要删除这个对话吗？')) {
                          onDeleteChat(chat.id);
                        }
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-border-theme space-y-1">
        <button 
          onClick={onOpenAnalyst}
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-bold text-text-secondary hover:bg-white hover:shadow-sm rounded-xl transition-all group"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-accent-theme" />
            项目分析 Artifacts
          </div>
          <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button 
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold text-text-secondary hover:bg-white hover:shadow-sm rounded-xl transition-all"
        >
          <Settings className="w-4 h-4" />
          系统设置
        </button>
        
        <div className="pt-4 flex items-center gap-3 px-3 py-2 border-t border-zinc-100 mt-2">
          <div className="w-8 h-8 rounded-full bg-accent-theme flex items-center justify-center font-bold text-xs text-white shadow-sm">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-text-primary truncate">Jane Doe</div>
            <div className="text-[10px] text-text-secondary font-medium truncate uppercase tracking-tighter">Pro Plan</div>
          </div>
        </div>
      </div>
    </div>
  );
}
