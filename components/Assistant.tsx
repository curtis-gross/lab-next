
import React, { useState, useRef, useEffect } from 'react';
import { brandConfig } from '../config';
import { generateAssistantResponse } from '../services/assistantService';
import { Send, Image as ImageIcon, Loader2, Sparkles, FileText, Activity, RotateCcw } from 'lucide-react';

interface Message {
  text: string;
  sender: 'user' | 'bot';
  images?: string[];
  html?: string;
}

export const Assistant = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      text: `Hello! I am your ${brandConfig.companyName} Assistant. How can I help you with your health plan today?`,
      sender: 'bot',
      html: `
                <div class="bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-200">
                    <p class="mb-3 text-gray-900">Hello! I am your ${brandConfig.companyName} Assistant. How can I help you with your health plan today?</p>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <button 
                            data-action="suggested-prompt" 
                            data-prompt="Help me find a doctor or specialist in my network."
                            class="text-left text-xs bg-white hover:bg-gray-100 text-gray-700 p-2 rounded transition-colors flex items-center gap-2 border border-gray-200"
                        >
                            <span class="text-lg">👨‍⚕️</span> Find a Provider
                        </button>
                        <button 
                            data-action="suggested-prompt"
                            data-prompt="What benefits are included in my current plan?"
                            class="text-left text-xs bg-white hover:bg-gray-100 text-gray-700 p-2 rounded transition-colors flex items-center gap-2 border border-gray-200"
                        >
                            <span class="text-lg">📋</span> Plan Benefits
                        </button>
                    </div>
                </div>
            `
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    // Auto-save messages when they change (only if not empty)
    if (messages.length > 1) {
      saveSession(messages);
    }
  }, [messages, loading]);

  const saveSession = (msgs: Message[]) => {
    fetch('/api/save-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        featureId: 'assistant_chat',
        data: { messages: msgs }
      })
    }).catch(err => console.error("Failed to save assistant session:", err));
  };

  const handleLoadLast = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/load-run/assistant_chat');
      if (!res.ok) throw new Error("No saved session found");
      const data = await res.json();
      if (data && data.messages) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.warn(error);
      alert("No previous session found.");
    } finally {
      setLoading(false);
    }
  };

  // Event Delegation for clickable suggestions
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      // Expand to any element with data-action (like lookup spans or buttons)
      const trigger = target.closest('[data-action="suggested-prompt"]');

      if (trigger && trigger instanceof HTMLElement && !loading) {
        const prompt = trigger.getAttribute('data-prompt');
        if (prompt) {
          processMessage(prompt, []);
        }
      }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [loading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const processMessage = async (msgText: string, msgImages: File[]) => {
    if ((!msgText.trim() && msgImages.length === 0) || loading) return;

    const userMsg: Message = { text: msgText, sender: 'user' };

    // Convert images to base64
    const base64Images: string[] = [];
    if (msgImages.length > 0) {
      const promises = msgImages.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });
      const results = await Promise.all(promises);
      base64Images.push(...results);
      userMsg.images = results;
    }

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setImages([]);
    setLoading(true);

    // Call Service
    try {
      // Include history (simplified)
      const history = messages.map(m => ({ sender: m.sender, text: m.text }));
      const response = await generateAssistantResponse(userMsg.text, history, base64Images);

      setMessages(prev => [...prev, {
        text: "Response generated",
        sender: 'bot',
        html: response.html
      }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        text: "Error",
        sender: 'bot',
        html: `<div class="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100">Sorry, I encountered an error. Please try again.</div>`
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    processMessage(input, images);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] content-card overflow-hidden">
      {/* Header */}
      <div
        className="page-header shadow-md z-10"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center backdrop-blur-sm">
            <Sparkles size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="section-header leading-tight text-gray-900">{brandConfig.companyName} Assistant</h2>
            <div className="flex items-center gap-2 text-xs opacity-90 text-gray-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Online • Member Support
            </div>
          </div>
        </div>
        <button
          onClick={handleLoadLast}
          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 font-bold border border-gray-200"
        >
          <RotateCcw size={14} /> Load Last
        </button>
      </div>

      {/* Chat Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
            <div className={`max-w-[85%] md:max-w-[75%] ${msg.sender === 'user' ? '' : 'w-full'}`}>
              {msg.sender === 'user' ? (
                <div
                  className="px-4 py-3 rounded-2xl rounded-br-none text-white shadow-sm bg-[#3F47E9]"
                >
                  {msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.images.map((img, i) => (
                        <img key={i} src={img} alt="upload" className="w-24 h-24 object-cover rounded-lg border-2 border-white/20" />
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              ) : (
                <div className="flex gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
                    style={{ backgroundColor: brandConfig.colors.accent }}
                  >
                    <span className="text-white font-bold text-xs">AI</span>
                  </div>
                  <div className="flex-1">
                    {msg.html ? (
                      <div dangerouslySetInnerHTML={{ __html: msg.html }} />
                    ) : (
                      <div className="bg-white p-4 rounded-xl rounded-tl-none border border-gray-200 shadow-sm text-gray-900">
                        {msg.text}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start animate-fadeIn">
            <div className="flex gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
                style={{ backgroundColor: brandConfig.colors.accent }}
              >
                <Loader2 size={14} className="text-white animate-spin" />
              </div>
              <div className="bg-white px-4 py-3 rounded-xl rounded-tl-none border border-gray-200 shadow-sm flex items-center gap-2">
                <span className="text-sm text-gray-500">Analyzing...</span>
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-100"></div>
                  <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        {images.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
            {images.map((file, idx) => (
              <div key={idx} className="relative w-16 h-16 shrink-0 group">
                <img src={URL.createObjectURL(file)} className="w-full h-full object-cover rounded-lg border border-gray-200" alt="upload" />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Upload Image"
            aria-label="Upload Image"
          >
            <ImageIcon size={20} />
          </button>
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-transparent border-none outline-none text-gray-900 placeholder-gray-400 text-sm"
            placeholder="Ask about benefits, claims, or finding care..."
          />

          <button
            onClick={handleSend}
            disabled={(!input.trim() && images.length === 0) || loading}
            className={`p-2 rounded-lg transition-all ${input.trim() || images.length > 0
              ? 'text-white shadow-sm hover:opacity-90'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            style={input.trim() || images.length > 0 ? { backgroundColor: brandConfig.colors.primary } : {}}
            aria-label="Send Message"
          >
            <Send size={18} />
          </button>
        </div>
        <div className="text-center mt-2">
          <p className="text-[10px] text-gray-400">AI can make mistakes. Verify important information.</p>
        </div>
      </div>
    </div>
  );
};
