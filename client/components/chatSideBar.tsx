import { useState, memo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send } from "lucide-react";

// cn utility function
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

interface Message {
  id: number;
  sender: string;
  text: string;
  timestamp: Date;
  isLocal: boolean;
}

interface ChatSidebarProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  remoteSocketId: string | null;
}

// Memoize individual message to prevent re-renders
const ChatMessage = memo(({ message }: { message: Message }) => (
  <div
    className={cn(
      "rounded-lg p-3",
      message.isLocal
        ? "bg-primary text-primary-foreground ml-4"
        : message.sender === "System"
        ? "bg-muted/50 text-center"
        : "bg-muted mr-4"
    )}
  >
    <div className="flex items-center gap-2 mb-1">
      <p className="text-xs font-semibold">{message.sender}</p>
      <p className="text-[10px] opacity-70">
        {message.timestamp.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
    <p className="text-sm">{message.text}</p>
  </div>
));

ChatMessage.displayName = "ChatMessage";

export const ChatSidebar = memo(
  ({ messages, onSendMessage, remoteSocketId }: ChatSidebarProps) => {
    const [messageInput, setMessageInput] = useState("");
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = useCallback(() => {
      if (messageInput.trim()) {
        onSendMessage(messageInput);
        setMessageInput("");
      }
    }, [messageInput, onSendMessage]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      },
      [handleSend]
    );

    return (
      <div className="w-80 border-l border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Meeting chat</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {remoteSocketId ? "2 participants" : "Only you"}
          </p>
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1"
              disabled={!remoteSocketId}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!messageInput.trim() || !remoteSocketId}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          {!remoteSocketId && (
            <p className="text-xs text-muted-foreground mt-2">
              Chat will be available when someone joins
            </p>
          )}
        </div>
      </div>
    );
  }
);

ChatSidebar.displayName = "ChatSidebar";
