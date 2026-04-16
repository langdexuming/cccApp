import { Plus, MessageSquare, Search, Settings, User } from 'lucide-react';
import { Chat } from '../types';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Pet } from './Pet';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  isTyping?: boolean;
  onOpenSettings?: () => void;
}

export function Sidebar({ chats, activeChatId, onSelectChat, onNewChat, isTyping, onOpenSettings }: SidebarProps) {
  return (
    <div className="w-[260px] h-full bg-bg-sidebar border-r border-border-theme flex flex-col">
      <div className="p-5 px-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 p-3 bg-white border border-border-theme rounded-lg shadow-sm hover:bg-zinc-50 transition-all group font-medium text-sm text-text-primary"
        >
          <Plus className="w-4 h-4 text-text-secondary group-hover:text-text-primary transition-colors" />
          开启新对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 space-y-1">
        <div className="px-2 py-3 text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
          最近对话
        </div>
        {chats.length === 0 ? (
          <div className="px-2 py-4 text-sm text-text-secondary italic">
            暂无对话
          </div>
        ) : (
          chats.sort((a, b) => b.updatedAt - a.updatedAt).map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md flex flex-col gap-0.5 transition-colors group",
                activeChatId === chat.id
                  ? "bg-[#EBEBE9]"
                  : "hover:bg-zinc-200/50"
              )}
            >
              <div className="text-sm font-medium text-text-primary truncate">
                {chat.title}
              </div>
              <div className="text-[10px] text-text-secondary">
                {formatDistanceToNow(chat.updatedAt, { addSuffix: true })}
              </div>
            </button>
          ))
        )}
      </div>

      <Pet isTyping={isTyping} />

      <div className="p-4 border-t border-border-theme space-y-2">
        <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:bg-zinc-200/50 rounded-lg transition-colors">
          <Search className="w-4 h-4" />
          搜索
        </button>
        <button 
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:bg-zinc-200/50 rounded-lg transition-colors"
        >
          <Settings className="w-4 h-4" />
          设置
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
