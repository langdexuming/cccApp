import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message as MessageType } from '../types';
import { cn } from '../lib/utils';
import { User, Bot, Copy, Check, ChevronDown, ChevronUp, Pencil, X as CloseIcon, Save } from 'lucide-react';

interface MessageProps {
  message: MessageType;
  onEdit?: (id: string, newContent: string) => void;
}

function CodeBlock({ language, value }: { language: string, value: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsible, setIsCollapsible] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const MAX_HEIGHT = 300;

  useEffect(() => {
    if (contentRef.current) {
      setIsCollapsible(contentRef.current.scrollHeight > MAX_HEIGHT);
    }
  }, [value]);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4 group/code rounded-xl border border-[#333] bg-[#1e1e1e] overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333]">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-[#333] transition-colors text-zinc-400 hover:text-zinc-200"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-500" />
              <span className="text-[10px] font-bold">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="text-[10px] font-bold">复制</span>
            </>
          )}
        </button>
      </div>

      <div 
        ref={contentRef}
        className={cn(
          "relative transition-all duration-300",
          !isExpanded && isCollapsible ? "max-h-[300px]" : "max-h-none"
        )}
        style={{ overflow: 'hidden' }}
      >
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          className="!m-0 !bg-transparent !p-4 font-mono text-sm leading-relaxed"
        >
          {value}
        </SyntaxHighlighter>
        
        {!isExpanded && isCollapsible && (
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#1e1e1e] via-[#1e1e1e]/80 to-transparent pointer-events-none" />
        )}
      </div>

      {isCollapsible && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full py-2.5 bg-[#252526] hover:bg-[#2d2d2d] text-zinc-400 hover:text-zinc-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border-t border-[#333]"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              收起代码
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              展开全部代码
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function Message({ message, onEdit }: MessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.style.height = 'auto';
      editRef.current.style.height = `${editRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit?.(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  return (
    <div className={cn(
      "group w-full mb-8 flex gap-5 relative",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "flex gap-5 max-w-full relative",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        <div className="flex-shrink-0">
          <div className={cn(
            "w-6 h-6 rounded flex items-center justify-center",
            isUser ? "bg-[#555]" : "bg-accent-theme"
          )}>
            {isUser ? (
              <User className="w-4 h-4 text-white" />
            ) : (
              <Bot className="w-4 h-4 text-white" />
            )}
          </div>
        </div>
        
        <div className={cn(
          "flex-1 min-w-0 space-y-2 relative group/content",
          isUser && !isEditing ? "bg-msg-user p-3 px-4 rounded-xl" : ""
        )}>
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                ref={editRef}
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                className="w-full bg-white border border-accent-theme/30 rounded-xl p-3 text-base text-text-primary focus:ring-4 focus:ring-accent-theme/5 focus:border-accent-theme outline-none resize-none transition-all"
                rows={1}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-text-secondary hover:bg-zinc-100 transition-colors flex items-center gap-1"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent-theme text-white hover:opacity-90 transition-opacity flex items-center gap-1 shadow-md shadow-accent-theme/20"
                >
                  <Save className="w-3.5 h-3.5" />
                  更新消息
                </button>
              </div>
            </div>
          ) : (
            <div className={cn(
              "prose prose-zinc max-w-none prose-p:leading-relaxed prose-p:text-base prose-headings:text-xl prose-headings:mb-3",
              isUser ? "prose-invert" : ""
            )}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const value = String(children).replace(/\n$/, '');
                    return !inline && match ? (
                      <CodeBlock language={match[1]} value={value} />
                    ) : (
                      <code className={cn("bg-zinc-100 px-1.5 py-0.5 rounded text-sm font-mono", isUser ? "bg-white/10" : "", className)} {...props}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Action Buttons */}
          <div className={cn(
            "absolute top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10",
            isUser ? "-left-20" : "-right-20"
          )}>
            {isUser && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 rounded-lg bg-white/80 backdrop-blur-sm border border-border-theme shadow-sm hover:bg-white active:scale-95"
                title="编辑消息"
              >
                <Pencil className="w-3.5 h-3.5 text-text-secondary" />
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-white/80 backdrop-blur-sm border border-border-theme shadow-sm hover:bg-white active:scale-95"
              title="复制内容"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-text-secondary" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
