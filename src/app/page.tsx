'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, Send, Loader2, Search, FileText } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function Chat() {
  const { messages, status, sendMessage } = useChat() as any;
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isLoading = status === 'submitted' || status === 'streaming';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isLoading]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus('Uploading and indexing...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setUploadedFileName(file.name);
        setUploadStatus(null);
      } else {
        setUploadStatus(`Error: ${data.error}`);
        setTimeout(() => setUploadStatus(null), 6000);
      }
    } catch (err) {
      setUploadStatus('Upload failed. Is ChromaDB running?');
      setTimeout(() => setUploadStatus(null), 6000);
    } finally {
      setIsUploading(false);
    }
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || isLoading) return;
    sendMessage({ text: input });
    setInput('');
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4 md:p-8 bg-background">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Document Assistant</h1>
          <p className="text-muted-foreground">Serverless RAG with Gemini & Pinecone</p>
        </div>
        <div className="flex items-center gap-3">
          {uploadedFileName && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 text-xs font-medium">
              <FileText className="w-3.5 h-3.5" />
              <span className="max-w-[160px] truncate">{uploadedFileName}</span>
            </div>
          )}
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept=".pdf" 
            onChange={handleFileUpload}
            disabled={isUploading}
          />
          <Button 
            variant="outline" 
            size="sm" 
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {uploadedFileName ? 'Replace PDF' : 'Upload PDF'}
          </Button>
        </div>
      </header>

      {uploadStatus && (
        <Card className="p-3 mb-4 bg-muted/50 text-sm animate-in fade-in slide-in-from-top-2">
          {uploadStatus}
        </Card>
      )}

      <Card className="flex-1 flex flex-col overflow-hidden border-2 shadow-xl rounded-2xl">
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
              <div className="p-4 bg-primary/10 rounded-full">
                <FileText className="w-12 h-12 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">How can I help you today?</h2>
              <p className="text-muted-foreground max-w-sm">
                Upload a PDF and ask me questions about it! I'll use RAG to find the relevant information.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m: any) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl p-4 ${
                    m.role === 'user' 
                      ? 'bg-primary text-primary-foreground shadow-lg' 
                      : 'bg-muted border shadow-sm'
                  }`}>
                    <div className="font-bold text-xs mb-1 uppercase tracking-wider opacity-70">
                      {m.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {m.parts && m.parts.length > 0 ? (
                        m.parts.map((part: any, i: number) => {
                          if (part.type === 'text') return <span key={i}>{part.text}</span>;
                          if (part.type === 'tool-call') {
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs italic opacity-80 my-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Searching documents...
                              </div>
                            );
                          }
                          return null;
                        })
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex justify-start">
                  <div className="bg-muted border shadow-sm rounded-2xl p-4 animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <Separator />

        <form onSubmit={onFormSubmit} className="p-4 bg-background flex gap-2 items-center">
          <input
            value={input}
            placeholder="Ask a question..."
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 h-12 rounded-full px-6 border-2 border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
          />
          <button 
            type="submit" 
            className="h-12 w-12 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed" 
            disabled={isLoading || !input}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </Card>
      
      <footer className="text-center text-xs text-muted-foreground mt-8">
        Powered by Google Gemini & Pinecone • Built with Vercel AI SDK
      </footer>
    </div>
  );
}
