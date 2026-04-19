import {useEffect, useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {ChatInterface} from './components/ChatInterface';
import {SettingsModal} from './components/SettingsModal';
import {Sidebar} from './components/Sidebar';
import {ProjectAnalyst} from './components/ProjectAnalyst';
import type {AppSettings, Chat} from './types';
import {cn} from './lib/utils';
import {loadPersistedState, savePersistedState} from './lib/desktop';
import {
  fetchLocalToolConfig,
  mergeLocalToolConfigIntoSettings,
} from './lib/mergeLocalToolConfig';
import {createDefaultSettings, normalizeSettings} from './lib/providerCatalog';

export default function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDesignPanelOpen, setIsDesignPanelOpen] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings());
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const persisted = await loadPersistedState();
        if (cancelled) {
          return;
        }
        if (persisted) {
          setChats(persisted.chats || []);
          setSettings(normalizeSettings(persisted.settings));
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
            setChats(parsed);
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

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }
    localStorage.setItem('claude_chats', JSON.stringify(chats));
    void savePersistedState({
      chats,
      settings,
      activeChatId,
    });
  }, [activeChatId, chats, hasLoadedPersistedState, settings]);

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }
    localStorage.setItem('claude_settings', JSON.stringify(settings));
  }, [hasLoadedPersistedState, settings]);

  const handleUpdateChat = (updatedChat: Chat) => {
    setChats(prev => {
      const index = prev.findIndex(item => item.id === updatedChat.id);
      if (index === -1) {
        return [...prev, updatedChat];
      }
      const next = [...prev];
      next[index] = updatedChat;
      return next;
    });
    setActiveChatId(updatedChat.id);
  };

  const handlePatchChat = (chatId: string, patch: Partial<Chat>) => {
    setChats(prev =>
      prev.map(item => (item.id === chatId ? {...item, ...patch} : item))
    );
  };

  const handleDeleteChat = (chatId: string) => {
    setChats((prev) => prev.filter((item) => item.id !== chatId));
    setActiveChatId((prev) => (prev === chatId ? null : prev));
  };

  const handleNewChat = () => {
    setActiveChatId(null);
  };

  const activeChat = chats.find(item => item.id === activeChatId) || null;

  return (
    <div className="flex h-screen w-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans selection:bg-orange-100 dark:selection:bg-orange-900/30">
      <AnimatePresence initial={false}>
        {isSidebarVisible && (
          <motion.div
            initial={{width: 0, opacity: 0}}
            animate={{width: '260px', opacity: 1}}
            exit={{width: 0, opacity: 0}}
            transition={{type: 'spring', damping: 25, stiffness: 200}}
            className="overflow-hidden flex-shrink-0"
          >
            <Sidebar
              chats={chats}
              activeChatId={activeChatId}
              onSelectChat={setActiveChatId}
              onNewChat={handleNewChat}
              onDeleteChat={handleDeleteChat}
              isTyping={isTyping}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenAnalyst={() => setIsDesignPanelOpen(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <main className="flex-1 h-full flex overflow-hidden relative">
        <div className={cn("flex-1 h-full min-w-0 transition-all duration-300", isDesignPanelOpen ? "w-1/2" : "w-full")}>
          <ChatInterface
            chat={activeChat}
            onUpdateChat={handleUpdateChat}
            onPatchChat={handlePatchChat}
            onNewChat={handleNewChat}
            chats={chats}
            onSelectChat={setActiveChatId}
            isSidebarVisible={isSidebarVisible}
            onToggleSidebar={() => setIsSidebarVisible(!isSidebarVisible)}
            onIsTypingChange={setIsTyping}
            settings={settings}
            onUpdateSettings={(next) => setSettings(normalizeSettings(next))}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isDesignPanelOpen={isDesignPanelOpen}
            onToggleDesignPanel={() => setIsDesignPanelOpen(!isDesignPanelOpen)}
          />
        </div>

        <AnimatePresence mode="wait">
          {isDesignPanelOpen && (
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 200 }}
              className="w-1/2 border-l border-border-theme h-full overflow-hidden bg-bg-canvas flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.02)]"
            >
              <ProjectAnalyst 
                isOpen={true} 
                isEmbedded={true}
                onClose={() => setIsDesignPanelOpen(false)}
                settings={settings.analysis}
                allProviders={settings.providers}
                onUpdateSettings={(analysisSettings) => {
                  setSettings(prev => ({ ...prev, analysis: analysisSettings }));
                }}
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
