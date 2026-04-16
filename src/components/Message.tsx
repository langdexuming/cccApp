import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message as MessageType } from '../types';
import { cn } from '../lib/utils';
import { User, Bot, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface MessageProps {
  message: MessageType;
}

function CodeBlock({ language, value }: { language: string, value: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsible, setIsCollapsible] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const MAX_HEIGHT = 300;

  useEffect(() => {
    if (contentRef.current) {
      setIsCollapsible(contentRef.current.scrollHeight > MAX_HEIGHT);
    }
  }, [value]);

  return (
    <div className="relative my-3 group/code">
      <div 
        ref={contentRef}
        className={cn(
          "rounded-lg overflow-hidden transition-all duration-300",
          !isExpanded && isCollapsible ? `max-h-[${MAX_HEIGHT}px]` : "max-h-none"
        )}
        style={{ maxHeight: !isExpanded && isCollapsible ? `${MAX_HEIGHT}px` : 'none' }}
      >
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          className="!m-0 !bg-[#1e1e1e] !text-[#d4d4d4] !p-4 font-mono text-sm"
        >
          {value}
        </SyntaxHighlighter>
        
        {!isExpanded && isCollapsible && (
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#1e1e1e] to-transparent pointer-events-none" />
        )}
      </div>

      {isCollapsible && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-zinc-400 hover:text-zinc-200 text-xs font-medium flex items-center justify-center gap-1.5 rounded-b-lg transition-colors border-t border-[#3d3d3d]"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              收起代码
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              展开全部代码
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          isUser ? "bg-msg-user p-3 px-4 rounded-xl" : ""
        )}>
          <div className="prose prose-zinc max-w-none prose-p:leading-relaxed prose-p:text-base prose-headings:text-xl prose-headings:mb-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const value = String(children).replace(/\n$/, '');
                  return !inline && match ? (
                    <CodeBlock language={match[1]} value={value} />
                  ) : (
                    <code className={cn("bg-zinc-100 px-1.5 py-0.5 rounded text-sm font-mono", className)} {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className={cn(
              "absolute top-0 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-lg bg-white/80 backdrop-blur-sm border border-border-theme shadow-sm hover:bg-white active:scale-95 z-10",
              isUser ? "-left-12" : "-right-12"
            )}
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
  );
}
