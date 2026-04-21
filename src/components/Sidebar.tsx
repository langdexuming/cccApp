import { Bot, ChevronDown, ChevronRight, FolderInput, MessageSquare, Pin, Plus, Search, Settings, Sparkles, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { AppSettings, Chat, ProviderType } from '../types';
import { openWorkspacePath } from '../lib/desktop';
import { cn } from '../lib/utils';
import {
  looksLikeWorkspacePath,
  normalizeWorkspaceValue,
  ungroupedWorkspaceLabel,
  workspaceGroupLabel,
  workspaceTooltip,
} from '../lib/workspace';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: (workspace?: string) => void;
  onDeleteChat: (id: string) => void;
  isTyping?: boolean;
  onOpenSettings?: () => void;
  onOpenAnalyst?: () => void;
  pendingWorkspace?: string;
  activeProvider: ProviderType;
  providers: AppSettings['providers'];
  collapsedSections: Record<string, boolean>;
  onCollapsedSectionsChange: (value: Record<string, boolean>) => void;
  pinnedWorkspaces: string[];
  onPinnedWorkspacesChange: (value: string[]) => void;
}

const UNGROUPED_LABEL = ungroupedWorkspaceLabel();

function wireApiLabel(wireApi: AppSettings['providers'][ProviderType]['wireApi']): string {
  switch (wireApi) {
    case 'cli':
      return 'CLI';
    case 'messages':
      return 'Messages';
    case 'chat_completions':
      return 'Chat Completions';
    case 'responses':
      return 'Responses';
    default:
      return 'API';
  }
}

function runtimeLabel(providerId: ProviderType | undefined, providers: AppSettings['providers']): string {
  if (!providerId) {
    return '未设置 Provider';
  }

  const provider = providers[providerId];
  if (!provider) {
    return providerId;
  }

  return `${provider.name} · ${wireApiLabel(provider.wireApi)}`;
}

function matchesSidebarSearch(chat: Chat, providers: AppSettings['providers'], query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystacks = [
    chat.title,
    normalizeWorkspaceValue(chat.workspace),
    workspaceGroupLabel(chat.workspace),
    runtimeLabel(chat.provider, providers),
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  return haystacks.some((value) => value.includes(normalizedQuery));
}

function workspaceSectionKey(scope: 'current' | 'history', workspace: string): string {
  return `${scope}::${workspace}`;
}

function WorkspaceSection({
  title,
  workspace,
  chats,
  activeChatId,
  providers,
  onSelectChat,
  onDeleteChat,
  onNewChat,
  pinned,
  onTogglePinned,
  collapsed,
  onToggleCollapsed,
  highlight = false,
  showCurrentBadge = false,
}: {
  title: string;
  workspace: string;
  chats: Chat[];
  activeChatId: string | null;
  providers: AppSettings['providers'];
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onNewChat: (workspace?: string) => void;
  pinned: boolean;
  onTogglePinned: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  highlight?: boolean;
  showCurrentBadge?: boolean;
}) {
  const isWorkspacePath = looksLikeWorkspacePath(workspace);

  return (
    <div className="space-y-2">
      <div
        className="px-2 py-1 text-[10px] font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2"
        title={workspaceTooltip(workspace)}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="inline-flex items-center gap-2 min-w-0 flex-1 text-left hover:text-text-primary transition-colors"
          title={collapsed ? '展开分组' : '收起分组'}
        >
          <span className={cn('w-1 h-1 rounded-full', highlight ? 'bg-orange-300' : 'bg-zinc-300')} />
          {collapsed ? <ChevronRight className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
          <span className="truncate">{title}</span>
        </button>
        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal">
          {chats.length}
        </span>
        <button
          type="button"
          onClick={() => onNewChat(workspace === UNGROUPED_LABEL ? '' : workspace)}
          className="rounded px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal hover:bg-white"
          title="在该工作区中新建对话"
        >
          新建
        </button>
        {isWorkspacePath ? (
          <button
            type="button"
            onClick={onTogglePinned}
            className={cn(
              'rounded px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal inline-flex items-center gap-1 hover:bg-white',
              pinned ? 'text-accent-theme' : 'text-text-secondary',
            )}
            title={pinned ? '取消置顶工作区' : '置顶工作区'}
          >
            <Pin className="w-3 h-3" />
            {pinned ? '已置顶' : '置顶'}
          </button>
        ) : null}
        {isWorkspacePath ? (
          <button
            type="button"
            onClick={() => {
              void openWorkspacePath(workspace).catch((error) => {
                window.alert(error instanceof Error ? error.message : String(error));
              });
            }}
            className="rounded px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal hover:bg-white"
            title="打开工作区"
          >
            打开
          </button>
        ) : null}
      </div>

      {!collapsed ? (
        <div
          className={cn(
            'rounded-2xl border bg-white/90 shadow-sm',
            highlight ? 'border-orange-200 bg-orange-50/60' : 'border-zinc-100',
          )}
        >
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 rounded-lg p-2',
                  highlight ? 'bg-orange-100 text-accent-theme' : 'bg-zinc-100 text-text-secondary',
                )}
              >
                <FolderInput className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-text-primary truncate">
                    {workspaceGroupLabel(workspace)}
                  </div>
                  {pinned ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-text-secondary">
                      置顶
                    </span>
                  ) : null}
                  {showCurrentBadge ? (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold text-accent-theme">
                      当前
                    </span>
                  ) : null}
                </div>
                {workspace !== UNGROUPED_LABEL ? (
                  <div className="mt-1 text-[10px] text-text-secondary break-all">{workspace}</div>
                ) : (
                  <div className="mt-1 text-[10px] text-text-secondary">未绑定工作区的本地对话</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-0.5 px-2 pb-2">
            {chats.length === 0 ? (
              <div className="rounded-xl px-3 py-3 text-xs text-text-secondary">
                这个工作区还没有历史对话，点击“新建”开始。
              </div>
            ) : (
              chats.map((chat) => (
                <div key={chat.id} className="relative group">
                  <button
                    onClick={() => onSelectChat(chat.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-xl flex flex-col gap-1 transition-all border',
                      activeChatId === chat.id
                        ? 'bg-white shadow-sm border-border-theme'
                        : 'hover:bg-zinc-50 border-transparent',
                    )}
                    title={chat.workspace || undefined}
                  >
                    <div className="text-[14px] font-medium text-text-primary truncate pr-5">
                      {chat.title}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-zinc-400 font-medium tracking-tight">
                        {formatDistanceToNow(chat.updatedAt, { addSuffix: true })}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-text-secondary">
                        {runtimeLabel(chat.provider, providers)}
                      </span>
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
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  isTyping,
  onOpenSettings,
  onOpenAnalyst,
  pendingWorkspace,
  activeProvider,
  providers,
  collapsedSections,
  onCollapsedSectionsChange,
  pinnedWorkspaces,
  onPinnedWorkspacesChange,
}: SidebarProps) {
  const [hostname, setHostname] = useState<string>('Local Machine');
  const [searchQuery, setSearchQuery] = useState('');

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null;
  const currentWorkspace = normalizeWorkspaceValue(pendingWorkspace || activeChat?.workspace);
  const activeRuntime = runtimeLabel(activeProvider, providers);
  const pinnedWorkspaceSet = useMemo(
    () => new Set(pinnedWorkspaces.map((workspace) => normalizeWorkspaceValue(workspace)).filter(Boolean)),
    [pinnedWorkspaces],
  );

  useEffect(() => {
    fetch('/api/system/info')
      .then((res) => res.json())
      .then((data) => {
        if (data.hostname) {
          setHostname(data.hostname);
        }
      })
      .catch(() => {
        setHostname(window.location.hostname.split('.')[0] || 'Local Machine');
      });
  }, []);

  const groupedChats = useMemo(() => {
    const groups: Record<string, Chat[]> = {};

    chats.forEach((chat) => {
      if (!matchesSidebarSearch(chat, providers, searchQuery)) {
        return;
      }

      const workspaceKey = normalizeWorkspaceValue(chat.workspace) || UNGROUPED_LABEL;
      if (!groups[workspaceKey]) {
        groups[workspaceKey] = [];
      }
      groups[workspaceKey].push({
        ...chat,
        workspace: normalizeWorkspaceValue(chat.workspace),
      });
    });

    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => b.updatedAt - a.updatedAt);
    });

    return groups;
  }, [chats, providers, searchQuery]);

  const toggleSection = (key: string) => {
    onCollapsedSectionsChange({
      ...collapsedSections,
      [key]: !collapsedSections[key],
    });
  };

  const currentWorkspaceChats = currentWorkspace ? groupedChats[currentWorkspace] || [] : [];
  const togglePinnedWorkspace = (workspace: string) => {
    const normalizedWorkspace = normalizeWorkspaceValue(workspace);
    if (!normalizedWorkspace || !looksLikeWorkspacePath(normalizedWorkspace)) {
      return;
    }

    if (pinnedWorkspaceSet.has(normalizedWorkspace)) {
      onPinnedWorkspacesChange(pinnedWorkspaces.filter((item) => normalizeWorkspaceValue(item) !== normalizedWorkspace));
      return;
    }

    onPinnedWorkspacesChange([...pinnedWorkspaces, normalizedWorkspace]);
  };
  const otherWorkspaceEntries = Object.entries(groupedChats)
    .filter(([workspace]) => workspace !== currentWorkspace)
    .sort(([a], [b]) =>
      pinnedWorkspaceSet.has(a) !== pinnedWorkspaceSet.has(b)
        ? Number(pinnedWorkspaceSet.has(b)) - Number(pinnedWorkspaceSet.has(a))
        : a === UNGROUPED_LABEL
          ? 1
          : b === UNGROUPED_LABEL
            ? -1
            : a.localeCompare(b),
    );

  const currentSectionKey = currentWorkspace ? workspaceSectionKey('current', currentWorkspace) : '';

  return (
    <div className="w-[300px] h-full bg-bg-sidebar border-r border-border-theme flex flex-col">
      <div className="px-4 pt-6 pb-4 border-b border-border-theme bg-white/80">
        <div className="rounded-2xl border border-orange-100 bg-orange-50/70 px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-widest text-accent-theme">
                当前 CLI
              </div>
              <div className="mt-1 text-sm font-semibold text-text-primary truncate">{activeRuntime}</div>
            </div>
            <Bot className="w-5 h-5 text-accent-theme shrink-0" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => onNewChat(currentWorkspace)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-text-primary shadow-sm hover:shadow transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-accent-theme" />
              {currentWorkspace ? '在当前工作区新建对话' : '新建本地对话'}
            </button>
            {isTyping ? (
              <span className="text-[10px] font-bold text-orange-600">AI 正在回复</span>
            ) : null}
          </div>
        </div>
        <div className="mt-3 relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索工作区、对话或 CLI"
            className="w-full rounded-xl border border-border-theme bg-white px-9 py-2 text-sm text-text-primary outline-none transition focus:border-accent-theme"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 scrollbar-none">
        {currentWorkspace ? (
          <WorkspaceSection
            title="当前工作区"
            workspace={currentWorkspace}
            chats={currentWorkspaceChats}
            activeChatId={activeChatId}
            providers={providers}
            onSelectChat={onSelectChat}
            onDeleteChat={onDeleteChat}
            onNewChat={onNewChat}
            pinned={pinnedWorkspaceSet.has(currentWorkspace)}
            onTogglePinned={() => togglePinnedWorkspace(currentWorkspace)}
            collapsed={!!collapsedSections[currentSectionKey]}
            onToggleCollapsed={() => toggleSection(currentSectionKey)}
            highlight
            showCurrentBadge
          />
        ) : null}

        {!currentWorkspace && Object.keys(groupedChats).length === 0 ? (
          <div className="px-2 py-8 text-center rounded-2xl border border-dashed border-zinc-200 bg-white/70">
            <MessageSquare className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
            <p className="text-xs text-text-secondary font-medium">
              {searchQuery.trim()
                ? '没有匹配的工作区或历史对话，换个关键词试试。'
                : '还没有历史对话，先选择工作区，或直接开始一个本地对话。'}
            </p>
            {!searchQuery.trim() ? (
              <button
                onClick={() => onNewChat('')}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-bold text-accent-theme"
              >
                <Plus className="w-3.5 h-3.5" />
                新建本地对话
              </button>
            ) : null}
          </div>
        ) : null}

        {otherWorkspaceEntries.map(([workspace, groupChats]) => {
          const sectionKey = workspaceSectionKey('history', workspace);
          return (
            <WorkspaceSection
              key={workspace}
              title={workspace === UNGROUPED_LABEL ? '本地对话' : '工作区历史'}
              workspace={workspace}
              chats={groupChats}
              activeChatId={activeChatId}
              providers={providers}
              onSelectChat={onSelectChat}
              onDeleteChat={onDeleteChat}
              onNewChat={onNewChat}
              pinned={pinnedWorkspaceSet.has(workspace)}
              onTogglePinned={() => togglePinnedWorkspace(workspace)}
              collapsed={collapsedSections[sectionKey] ?? workspace !== UNGROUPED_LABEL}
              onToggleCollapsed={() => toggleSection(sectionKey)}
            />
          );
        })}
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
          <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-text-primary truncate">{hostname}</div>
            <div className="text-[10px] text-accent-theme font-bold truncate uppercase tracking-tighter">
              天才程序员
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
