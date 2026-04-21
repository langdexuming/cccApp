import {useEffect, useMemo, useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {ChatInterface} from './components/ChatInterface';
import {SettingsModal} from './components/SettingsModal';
import {Sidebar} from './components/Sidebar';
import {ProjectAnalyst} from './components/ProjectAnalyst';
import {AutoUpdate} from './components/AutoUpdate';
import type {AppSettings, Chat, WorkspaceExternalConversation} from './types';
import {cn} from './lib/utils';
import {
  fetchWorkspaceExternalConversations,
  loadPersistedState,
  savePersistedState,
} from './lib/desktop';
import {normalizeWorkspaceValue} from './lib/workspace';
import {
  fetchLocalToolConfig,
  mergeLocalToolConfigIntoSettings,
} from './lib/mergeLocalToolConfig';
import {createDefaultSettings, normalizeSettings} from './lib/providerCatalog';

export default function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeExternalConversationId, setActiveExternalConversationId] = useState<string | null>(null);
  const [pendingWorkspace, setPendingWorkspace] = useState<string>('');
  const [sidebarCollapsedSections, setSidebarCollapsedSections] = useState<Record<string, boolean>>({});
  const [pinnedWorkspaces, setPinnedWorkspaces] = useState<string[]>([]);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDesignPanelOpen, setIsDesignPanelOpen] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings());
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false);
  const [externalMessage, setExternalMessage] = useState<string | null>(null);
  const [workspaceExternalConversations, setWorkspaceExternalConversations] = useState<
    WorkspaceExternalConversation[]
  >([]);
  const [isLoadingExternalConversations, setIsLoadingExternalConversations] = useState(false);
  const [externalConversationsError, setExternalConversationsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const persisted = await loadPersistedState();
        if (cancelled) {
          return;
        }
        if (persisted) {
          setChats(
            (persisted.chats || []).map((chat) => ({
              ...chat,
              workspace: normalizeWorkspaceValue(chat.workspace),
            })),
          );
          setSettings(normalizeSettings(persisted.settings));
          setPendingWorkspace(normalizeWorkspaceValue(persisted.pendingWorkspace));
          setSidebarCollapsedSections(persisted.sidebarCollapsedSections || {});
          setPinnedWorkspaces(
            (persisted.pinnedWorkspaces || []).map((workspace) => normalizeWorkspaceValue(workspace)),
          );
          const nextActiveChatId =
            persisted.activeChatId && persisted.chats.some((item) => item.id === persisted.activeChatId)
              ? persisted.activeChatId
              : (persisted.chats[0]?.id ?? null);
          setActiveChatId(nextActiveChatId);
          return;
        }

        const savedChats = localStorage.getItem('claude_chats');
        if (savedChats) {
          try {
            const parsed = JSON.parse(savedChats) as Chat[];
            setChats(
              parsed.map((chat) => ({
                ...chat,
                workspace: normalizeWorkspaceValue(chat.workspace),
              })),
            );
            if (parsed.length > 0) {
              setActiveChatId(parsed[0].id);
            }
          } catch (error) {
            console.error('Failed to parse saved chats', error);
          }
        }

        const savedSettings = localStorage.getItem('claude_settings');
        if (savedSettings) {
          try {
            setSettings(normalizeSettings(JSON.parse(savedSettings)));
          } catch (error) {
            console.error('Failed to parse saved settings', error);
          }
        }

        const savedSidebarState = localStorage.getItem('claude_sidebar_collapsed_sections');
        if (savedSidebarState) {
          try {
            setSidebarCollapsedSections(JSON.parse(savedSidebarState) as Record<string, boolean>);
          } catch (error) {
            console.error('Failed to parse saved sidebar state', error);
          }
        }

        const savedPinnedWorkspaces = localStorage.getItem('claude_pinned_workspaces');
        if (savedPinnedWorkspaces) {
          try {
            setPinnedWorkspaces(
              (JSON.parse(savedPinnedWorkspaces) as string[]).map((workspace) =>
                normalizeWorkspaceValue(workspace),
              ),
            );
          } catch (error) {
            console.error('Failed to parse pinned workspaces', error);
          }
        }
      } finally {
        if (!cancelled) {
          setHasLoadedPersistedState(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchLocalToolConfig();
      if (!data || !data.ok || cancelled) {
        return;
      }
      setSettings((prev) => mergeLocalToolConfigIntoSettings(prev, data));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeChat = useMemo(
    () => chats.find((item) => item.id === activeChatId) || null,
    [activeChatId, chats],
  );
  const activeExternalConversation = useMemo(
    () =>
      workspaceExternalConversations.find((item) => item.id === activeExternalConversationId) || null,
    [activeExternalConversationId, workspaceExternalConversations],
  );
  const currentWorkspace = normalizeWorkspaceValue(
    pendingWorkspace || activeChat?.workspace || activeExternalConversation?.workspace,
  );

  useEffect(() => {
    let cancelled = false;

    if (!currentWorkspace) {
      setWorkspaceExternalConversations([]);
      setActiveExternalConversationId(null);
      setExternalConversationsError(null);
      setIsLoadingExternalConversations(false);
      return;
    }

    setIsLoadingExternalConversations(true);
    setExternalConversationsError(null);

    fetchWorkspaceExternalConversations(currentWorkspace)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setWorkspaceExternalConversations(
          items.map((item) => ({
            ...item,
            workspace: normalizeWorkspaceValue(item.workspace),
          })),
        );
        setActiveExternalConversationId((prev) =>
          prev && items.some((item) => item.id === prev) ? prev : null,
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setWorkspaceExternalConversations([]);
        setActiveExternalConversationId(null);
        setExternalConversationsError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingExternalConversations(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentWorkspace]);

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }
    localStorage.setItem('claude_chats', JSON.stringify(chats));
    void savePersistedState({
      chats,
      settings,
      activeChatId,
      pendingWorkspace: normalizeWorkspaceValue(pendingWorkspace),
      sidebarCollapsedSections,
      pinnedWorkspaces: pinnedWorkspaces.map((workspace) => normalizeWorkspaceValue(workspace)),
    });
  }, [
    activeChatId,
    chats,
    hasLoadedPersistedState,
    pendingWorkspace,
    settings,
    sidebarCollapsedSections,
    pinnedWorkspaces,
  ]);

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }
    localStorage.setItem('claude_settings', JSON.stringify(settings));
  }, [hasLoadedPersistedState, settings]);

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }
    localStorage.setItem(
      'claude_sidebar_collapsed_sections',
      JSON.stringify(sidebarCollapsedSections),
    );
  }, [hasLoadedPersistedState, sidebarCollapsedSections]);

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }
    localStorage.setItem('claude_pinned_workspaces', JSON.stringify(pinnedWorkspaces));
  }, [hasLoadedPersistedState, pinnedWorkspaces]);

  const handleSelectChat = (chatId: string) => {
    const nextChat = chats.find((item) => item.id === chatId) || null;
    setActiveExternalConversationId(null);
    setActiveChatId(chatId);
    setPendingWorkspace(normalizeWorkspaceValue(nextChat?.workspace));
  };

  const handleSelectExternalConversation = (conversationId: string) => {
    const nextConversation =
      workspaceExternalConversations.find((item) => item.id === conversationId) || null;
    setActiveChatId(null);
    setActiveExternalConversationId(conversationId);
    setPendingWorkspace(normalizeWorkspaceValue(nextConversation?.workspace));
  };

  const handleUpdateChat = (updatedChat: Chat) => {
    setChats((prev) => {
      const index = prev.findIndex((item) => item.id === updatedChat.id);
      if (index === -1) {
        return [...prev, updatedChat];
      }
      const next = [...prev];
      next[index] = updatedChat;
      return next;
    });
    setActiveExternalConversationId(null);
    setActiveChatId(updatedChat.id);
    setPendingWorkspace(normalizeWorkspaceValue(updatedChat.workspace));
  };

  const handlePatchChat = (chatId: string, patch: Partial<Chat>) => {
    setChats((prev) =>
      prev.map((item) => (item.id === chatId ? {...item, ...patch} : item)),
    );

    if (chatId === activeChatId && Object.prototype.hasOwnProperty.call(patch, 'workspace')) {
      setPendingWorkspace(normalizeWorkspaceValue(patch.workspace));
    }
  };

  const handleDeleteChat = (chatId: string) => {
    setChats((prev) => prev.filter((item) => item.id !== chatId));
    setActiveChatId((prev) => (prev === chatId ? null : prev));
  };

  const handleNewChat = (workspace?: string) => {
    const nextWorkspace =
      normalizeWorkspaceValue(workspace) ||
      normalizeWorkspaceValue(activeExternalConversation?.workspace) ||
      (activeChat?.workspace || '').trim() ||
      pendingWorkspace;
    setPendingWorkspace(nextWorkspace);
    setActiveExternalConversationId(null);
    setActiveChatId(null);
  };

  return (
    <div className="flex h-screen w-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans selection:bg-orange-100 dark:selection:bg-orange-900/30">
      <AutoUpdate />
      <AnimatePresence initial={false}>
        {isSidebarVisible && (
          <motion.div
            initial={{width: 0, opacity: 0}}
            animate={{width: '300px', opacity: 1}}
            exit={{width: 0, opacity: 0}}
            transition={{type: 'spring', damping: 25, stiffness: 200}}
            className="overflow-hidden flex-shrink-0"
          >
            <Sidebar
              chats={chats}
              activeChatId={activeChatId}
              activeExternalConversationId={activeExternalConversationId}
              externalConversations={workspaceExternalConversations}
              isLoadingExternalConversations={isLoadingExternalConversations}
              externalConversationsError={externalConversationsError}
              onSelectChat={handleSelectChat}
              onSelectExternalConversation={handleSelectExternalConversation}
              onNewChat={handleNewChat}
              onDeleteChat={handleDeleteChat}
              isTyping={isTyping}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenAnalyst={() => setIsDesignPanelOpen(true)}
              pendingWorkspace={pendingWorkspace}
              activeProvider={settings.activeProvider}
              providers={settings.providers}
              collapsedSections={sidebarCollapsedSections}
              onCollapsedSectionsChange={setSidebarCollapsedSections}
              pinnedWorkspaces={pinnedWorkspaces}
              onPinnedWorkspacesChange={setPinnedWorkspaces}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <main className="flex-1 h-full flex overflow-hidden relative">
        <div
          className={cn(
            'flex-1 h-full min-w-0 transition-all duration-300',
            isDesignPanelOpen ? 'w-1/2' : 'w-full',
          )}
        >
          <ChatInterface
            chat={activeChat}
            externalConversation={activeExternalConversation}
            onUpdateChat={handleUpdateChat}
            onPatchChat={handlePatchChat}
            onNewChat={handleNewChat}
            chats={chats}
            onSelectChat={handleSelectChat}
            isSidebarVisible={isSidebarVisible}
            onToggleSidebar={() => setIsSidebarVisible(!isSidebarVisible)}
            onIsTypingChange={setIsTyping}
            settings={settings}
            pendingWorkspace={pendingWorkspace}
            onPendingWorkspaceChange={setPendingWorkspace}
            onUpdateSettings={(next) => setSettings(normalizeSettings(next))}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isDesignPanelOpen={isDesignPanelOpen}
            onToggleDesignPanel={() => setIsDesignPanelOpen(!isDesignPanelOpen)}
            externalInput={externalMessage}
            onClearExternalInput={() => setExternalMessage(null)}
          />
        </div>

        <AnimatePresence mode="wait">
          {isDesignPanelOpen && (
            <motion.div
              initial={{x: '100%', opacity: 0}}
              animate={{x: 0, opacity: 1}}
              exit={{x: '100%', opacity: 0}}
              transition={{type: 'spring', damping: 30, stiffness: 200}}
              className="w-1/2 border-l border-border-theme h-full overflow-hidden bg-bg-canvas flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.02)]"
            >
              <ProjectAnalyst
                isOpen={true}
                isEmbedded={true}
                onClose={() => setIsDesignPanelOpen(false)}
                settings={settings.analysis}
                appSettings={settings}
                onUpdateSettings={(analysisSettings) => {
                  setSettings((prev) => ({...prev, analysis: analysisSettings}));
                }}
                onDiscussWithAI={(prompt) => setExternalMessage(prompt)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={(newSettings) => {
          setSettings(normalizeSettings(newSettings));
          setIsSettingsOpen(false);
        }}
      />
    </div>
  );
}
