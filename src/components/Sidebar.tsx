import { Plus, MessageSquare, Search, Settings, User, GitBranch, Trash2, ChevronDown, Folder } from 'lucide-react';
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
}

export function Sidebar({ chats, activeChatId, onSelectChat, onNewChat, onDeleteChat, isTyping, onOpenSettings }: SidebarProps) {
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
    <div className="w-[260px] h-full bg-bg-sidebar border-r border-border-theme flex flex-col">
      <div className="p-5 px-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-between p-3 bg-white border border-border-theme rounded-lg shadow-sm hover:bg-zinc-50 transition-all group font-medium text-sm text-text-primary"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-text-secondary group-hover:text-text-primary transition-colors" />
            开启新对话
          </div>
          <kbd className="hidden md:inline-flex h-5 w-8 items-center justify-center rounded border border-zinc-200 bg-zinc-50 font-mono text-[10px] font-medium text-zinc-400">
            ⌘N
          </kbd>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 space-y-4 pb-4">
        {chats.length === 0 ? (
          <div className="px-2 py-4 text-sm text-text-secondary italic">
            暂无对话
          </div>
        ) : (
          Object.entries(groupedChats).sort(([a], [b]) => a === '本地 / 未分组' ? 1 : b === '本地 / 未分组' ? -1 : a.localeCompare(b)).map(([workspace, groupChats]) => (
            <div key={workspace} className="space-y-1">
              <button
                onClick={() => toggleGroup(workspace)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-text-secondary uppercase tracking-tight hover:text-text-primary transition-colors group/group"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Folder className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{workspace}</span>
                </div>
                <ChevronDown className={cn(
                  "w-3 h-3 transition-transform duration-200",
                  expandedGroups[workspace] === false ? "-rotate-90" : "rotate-0"
                )} />
              </button>
              
              {expandedGroups[workspace] !== false && (
                <div className="space-y-0.5 ml-1">
                  {groupChats.map((chat) => (
                    <div key={chat.id} className="relative group">
                      <button
                        onClick={() => onSelectChat(chat.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg flex flex-col gap-0.5 transition-all",
                          activeChatId === chat.id
                            ? "bg-white shadow-sm border border-border-theme"
                            : "hover:bg-zinc-100/80 border border-transparent"
                        )}
                      >
                        <div className="text-[13px] font-medium text-text-primary truncate pr-5">
                          {chat.title}
                        </div>
                        <div className="text-[10px] text-text-secondary">
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
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-50"
                        title="删除对话"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Pet isTyping={isTyping} />

      <div className="p-4 border-t border-border-theme space-y-2">
        <button 
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:bg-zinc-200/50 rounded-lg transition-colors"
        >
          <GitBranch className="w-4 h-4" />
          Git 管理
        </button>
        <button className="w-full flex items-center justify-between px-3 py-2 text-sm text-text-secondary hover:bg-zinc-200/50 rounded-lg transition-colors group">
          <div className="flex items-center gap-3">
            <Search className="w-4 h-4" />
            搜索
          </div>
          <kbd className="hidden group-hover:inline-flex h-4 w-7 items-center justify-center rounded border border-zinc-200 bg-zinc-50 font-mono text-[9px] font-medium text-zinc-400">
            ⌘K
          </kbd>
        </button>
        <button 
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-text-secondary hover:bg-zinc-200/50 rounded-lg transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4" />
            设置
          </div>
          <kbd className="hidden group-hover:inline-flex h-4 w-7 items-center justify-center rounded border border-zinc-200 bg-zinc-50 font-mono text-[9px] font-medium text-zinc-400">
            ⌘,
          </kbd>
        </button>
        <div className="pt-3 flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center font-bold text-xs">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">Jane Doe</div>
          </div>
        </div>
      </div>
    </div>
  );
}
