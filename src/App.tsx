import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { Chat, AppSettings } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { SettingsModal } from './components/SettingsModal';
import { DEFAULT_SETTINGS } from './constants';
import {
  fetchLocalToolConfig,
  mergeLocalToolConfigIntoSettings,
} from './lib/mergeLocalToolConfig';
import {loadPersistedState, savePersistedState} from './lib/desktop';

 

export default function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const persisted = await loadPersistedState();
        if (cancelled) {
          return;
        }

        const mergeSettings = (saved: any): AppSettings => {
          return {
            ...DEFAULT_SETTINGS,
            ...saved,
            collaboration: {
              ...DEFAULT_SETTINGS.collaboration,
              ...(saved?.collaboration || {})
            },
            git: {
              ...DEFAULT_SETTINGS.git,
              ...(saved?.git || {})
            }
          };
        };

        if (persisted) {
          setChats(persisted.chats || []);
          setSettings(mergeSettings(persisted.settings));
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
          } catch (e) {
            console.error('Failed to parse saved chats', e);
          }
        }

        const savedSettings = localStorage.getItem('claude_settings');
        if (savedSettings) {
          try {
            const parsed = JSON.parse(savedSettings);
            setSettings(mergeSettings(parsed));
          } catch (e) {
            console.error('Failed to parse saved settings', e);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Sidebar: Ctrl + B or Cmd + B
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarVisible(prev => !prev);
      }
      // New Chat: Ctrl + N or Cmd + N (Note: many browsers block this, so maybe Alt + Shift + N as fallback)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewChat();
      }
      // Settings: Ctrl + , or Cmd + ,
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleUpdateChat = (updatedChat: Chat) => {
    setChats(prev => {
      // If it's a new chat, add workspace from settings if git is enabled
      const chatToUpdate = { ...updatedChat };
      if (settings.git?.enabled && settings.git.repoUrl && !chatToUpdate.workspace) {
        chatToUpdate.workspace = settings.git.repoUrl;
      }
      
      const index = prev.findIndex(c => c.id === chatToUpdate.id);
      if (index === -1) {
        return [...prev, chatToUpdate];
      }
      const newChats = [...prev];
      newChats[index] = chatToUpdate;
      return newChats;
    });
    setActiveChatId(updatedChat.id);
  };

  const handleDeleteChat = (id: string) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null);
    }
  };

  const handleNewChat = () => {
    setActiveChatId(null);
  };

  const activeChat = chats.find(c => c.id === activeChatId) || null;

  return (
    <div className="flex h-screen w-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans selection:bg-orange-100 dark:selection:bg-orange-900/30">
      <AnimatePresence initial={false}>
        {isSidebarVisible && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: '260px', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
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
            />
          </motion.div>
        )}
      </AnimatePresence>
      <main className="flex-1 h-full overflow-hidden relative">
        <ChatInterface
          chat={activeChat}
          onUpdateChat={handleUpdateChat}
          onNewChat={handleNewChat}
          chats={chats}
          onSelectChat={setActiveChatId}
          isSidebarVisible={isSidebarVisible}
          onToggleSidebar={() => setIsSidebarVisible(!isSidebarVisible)}
          onIsTypingChange={setIsTyping}
          settings={settings}
          onUpdateSettings={setSettings}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={(newSettings) => {
          setSettings(newSettings);
          setIsSettingsOpen(false);
        }}
      />
    </div>
  );
}
