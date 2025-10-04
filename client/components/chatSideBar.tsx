"use client";

import type React from "react";

import { useState, memo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, X } from "lucide-react";

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
  isMobile?: boolean;
  onClose?: () => void;
}

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
  ({
    messages,
    onSendMessage,
    remoteSocketId,
    isMobile = false,
    onClose,
  }: ChatSidebarProps) => {
    const [messageInput, setMessageInput] = useState("");
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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
      <div
        className={cn(
          "flex flex-col bg-background",
          isMobile ? "fixed inset-0 z-50" : "w-80 border-l border-border"
        )}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex-1">
            <h2 className="font-semibold text-base sm:text-lg">Meeting chat</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {remoteSocketId ? "2 participants" : "Only you"}
            </p>
          </div>
          {isMobile && onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
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

        <div className="p-3 sm:p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 h-10 sm:h-11 text-base"
              disabled={!remoteSocketId}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!messageInput.trim() || !remoteSocketId}
              className="h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0"
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
