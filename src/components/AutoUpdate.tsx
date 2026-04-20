import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Download, X, Sparkles, AlertCircle } from 'lucide-react';
import { checkDesktopUpdate, isTauriRuntime } from '../lib/desktop';

const CURRENT_VERSION = '1.0.0'; // Should ideally come from metadata or build env

interface UpdateInfo {
  version: string;
  notes?: string;
  date?: string;
}

export function AutoUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const checkForUpdates = async () => {
    setIsChecking(true);
    setError(null);

    try {
      if (isTauriRuntime()) {
        // Tauri Desktop Check
        const update = await checkDesktopUpdate();
        if (update?.available) {
          setUpdateAvailable({
            version: update.version,
            notes: update.body,
            date: update.date
          });
          setIsVisible(true);
        }
      } else {
        // Web Check - Mocking a version.json fetch
        // In a real app, you'd fetch('/version.json') and compare
        try {
          const response = await fetch('/version.json').catch(() => null);
          if (response?.ok) {
            const data = await response.json();
            if (data.version !== CURRENT_VERSION) {
              setUpdateAvailable({
                version: data.version,
                notes: data.notes || '新版本包含性能优化和 bug 修复。'
              });
              setIsVisible(true);
            }
          }
        } catch (e) {
          console.warn('Web update check ignored', e);
        }
      }
    } catch (e) {
      console.error('Update check failed', e);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // Check initially after a short delay
    const timer = setTimeout(checkForUpdates, 5000);
    
    // Periodically check every 30 minutes
    const interval = setInterval(checkForUpdates, 1000 * 60 * 30);
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const handleUpdate = async () => {
    if (isTauriRuntime()) {
      // In Tauri, the updater plugin can handle it
      try {
        const update = await checkDesktopUpdate();
        if (update && update.downloadAndInstall) {
           await update.downloadAndInstall((progress) => {
             console.log('Download progress:', progress);
           });
           // Depending on plugin configuration, it might relaunch automatically
        }
      } catch (e) {
        setError('集成更新失败，请手动下载。');
      }
    } else {
      // Web: Just reload
      window.location.reload();
    }
  };

  return (
    <AnimatePresence>
      {isVisible && updateAvailable && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 20, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-4"
        >
          <div className="bg-white dark:bg-zinc-900 border border-border-theme rounded-2xl shadow-2xl p-4 flex items-center gap-4 group">
            <div className="w-10 h-10 rounded-full bg-accent-theme/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-accent-theme" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-text-primary">新版本现已发布</h4>
                <span className="text-[10px] font-black bg-accent-theme/10 text-accent-theme px-1.5 py-0.5 rounded uppercase">
                  v{updateAvailable.version}
                </span>
              </div>
              <p className="text-xs text-text-secondary truncate mt-0.5">
                {updateAvailable.notes || '快来体验最新的功能和优化。'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleUpdate}
                className="px-4 py-1.5 bg-text-primary text-white rounded-xl text-[11px] font-bold hover:shadow-lg shadow-text-primary/10 transition-all flex items-center gap-2"
              >
                {isTauriRuntime() ? <Download className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {isTauriRuntime() ? '下载更新' : '立即刷新'}
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="absolute -bottom-10 left-0 right-0 flex justify-center">
                <div className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 border border-red-100">
                  <AlertCircle className="w-3 h-3" />
                  {error}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
