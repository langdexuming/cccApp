import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { Chat, AppSettings } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { SettingsModal } from './components/SettingsModal';
import {
  fetchLocalToolConfig,
  mergeLocalToolConfigIntoSettings,
} from './lib/mergeLocalToolConfig';
import {loadPersistedState, savePersistedState} from './lib/desktop';

const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'gemini',
  providers: {
    gemini: {
      id: 'gemini',
      name: 'Gemini',
      apiKey: '',
      enabled: true,
      models: ['gemini-3-flash-preview', 'gemini-3-pro-preview']
    },
    claude: {
      id: 'claude',
      name: 'Claude',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      enabled: true,
      models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      enabled: true,
      models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo']
    },
    custom: {
      id: 'custom',
      name: '自定义 (OpenAPI)',
      apiKey: '',
      baseUrl: '',
      enabled: true,
      models: ['default']
    }
  }
};

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
        if (persisted) {
          setChats(persisted.chats || []);
          setSettings(persisted.settings || DEFAULT_SETTINGS);
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
            setSettings(JSON.parse(savedSettings));
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

  const handleUpdateChat = (updatedChat: Chat) => {
    setChats(prev => {
      const index = prev.findIndex(c => c.id === updatedChat.id);
      if (index === -1) {
        return [...prev, updatedChat];
      }
      const newChats = [...prev];
      newChats[index] = updatedChat;
      return newChats;
    });
    setActiveChatId(updatedChat.id);
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
