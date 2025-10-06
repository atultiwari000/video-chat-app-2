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
      "rounded-lg p-3 break-words",
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
    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
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
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
      if (messagesContainerRef.current) {
        const container = messagesContainerRef.current;
        // Check if user was near bottom before new message
        const isNearBottom =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          100;

        if (isNearBottom) {
          // Small delay to ensure DOM has updated
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 50);
        }
      }
    }, [messages]);

    const handleSend = useCallback(() => {
      if (messageInput.trim()) {
        onSendMessage(messageInput.trim());
        setMessageInput("");

        // Force scroll to bottom after sending
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
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
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex-1 min-w-0">
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
              className="flex-shrink-0 ml-2"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>

        {/* Messages Area */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground text-center py-8">
                No messages yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-3 sm:p-4 border-t border-border flex-shrink-0">
          <div className="flex gap-2">
            <Input
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                remoteSocketId
                  ? "Type a message..."
                  : "Waiting for participant..."
              }
              className="flex-1 h-10 sm:h-11 text-base"
              disabled={!remoteSocketId}
              autoComplete="off"
              maxLength={500}
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
          {messageInput.length > 450 && (
            <p className="text-xs text-muted-foreground mt-1">
              {500 - messageInput.length} characters remaining
            </p>
          )}
        </div>
      </div>
    );
  }
);

ChatSidebar.displayName = "ChatSidebar";
