import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Image as ImageIcon, FileText, Video, X, Loader2, Play, Pause, StopCircle, Trash2, ExternalLink, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ai, fileToGenerativePart, blobToGenerativePart } from '../lib/gemini';
import { LearningPath, LearningStep } from './LearningPath';
import { Type } from "@google/genai";

interface Message {
  role: 'user' | 'model';
  content: string;
  files?: File[];
  audioBlob?: Blob;
  timestamp: Date;
  groundingMetadata?: any;
  learningPath?: {
    topic: string;
    goal: string;
    steps: LearningStep[];
  };
}

const learningPathTool = {
  name: "recommend_learning_path",
  description: "Recommend a structured learning path with articles, videos, and exercises based on the user's needs.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      topic: { type: Type.STRING, description: "The main topic of the learning path" },
      goal: { type: Type.STRING, description: "The learning objective" },
      steps: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["article", "video", "exercise"] },
            url: { type: Type.STRING, description: "Optional URL for the resource" }
          },
          required: ["title", "description", "type"]
        }
      }
    },
    required: ["topic", "goal", "steps"]
  }
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const onDrop = (acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles]);
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ 
    onDrop,
    noClick: true, // Prevent click on container from opening file dialog
    accept: {
      'image/*': [],
      'video/*': [],
      'application/pdf': ['.pdf'],
      'text/*': ['.txt', '.md', '.csv', '.json', '.js', '.ts', '.tsx', '.html', '.css'],
    }
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Detect supported MIME type
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg'
      ].find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const clearChat = () => {
    setMessages([]);
    setFiles([]);
    setAudioBlob(null);
    setInput('');
  };

  const updateLearningPathProgress = (messageIndex: number, stepIndex: number, completed: boolean) => {
    setMessages(prev => prev.map((msg, i) => {
      if (i === messageIndex && msg.learningPath) {
        const newSteps = [...msg.learningPath.steps];
        newSteps[stepIndex] = { ...newSteps[stepIndex], completed };
        return { ...msg, learningPath: { ...msg.learningPath, steps: newSteps } };
      }
      return msg;
    }));
  };

  const handleStartExercise = (step: LearningStep) => {
    setInput(`我准备好开始练习了：${step.title}。请给我出一道练习题。`);
  };

  const handleSend = async () => {
    if ((!input.trim() && files.length === 0 && !audioBlob) || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      files: [...files],
      audioBlob: audioBlob || undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setFiles([]);
    setAudioBlob(null);
    setIsLoading(true);

    try {
      const parts: any[] = [];

      if (userMessage.content) {
        parts.push({ text: userMessage.content });
      }

      for (const file of userMessage.files || []) {
        const part = await fileToGenerativePart(file);
        parts.push(part);
      }

      if (userMessage.audioBlob) {
        const part = await blobToGenerativePart(userMessage.audioBlob, userMessage.audioBlob.type);
        parts.push(part);
      }

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: {
            systemInstruction: "你是一位乐于助人且知识渊博的中学导师。请清晰简单地解释概念。适当使用类比。当用户询问特定主题时，请主动使用 Google 搜索查找并推荐相关的优质学习资料（如文章或视频链接），以帮助用户深入学习。如果用户要求制定学习计划、学习指南或针对特定主题的建议，请使用 'recommend_learning_path' 工具创建结构化计划。请始终用中文回复。",
            tools: [
              { googleSearch: {} },
              { functionDeclarations: [learningPathTool] }
            ],
        }
      });

      const responseText = result.text || "";
      const groundingMetadata = result.candidates?.[0]?.groundingMetadata;
      
      // Check for function calls
      const functionCalls = result.functionCalls;
      let learningPathData = undefined;

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls.find(c => c.name === 'recommend_learning_path');
        if (call) {
          learningPathData = call.args as any;
        }
      }

      const botMessage: Message = {
        role: 'model',
        content: responseText || (learningPathData ? "这是为您推荐的学习路径：" : "我无法生成回复。"),
        timestamp: new Date(),
        groundingMetadata,
        learningPath: learningPathData
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error generating response:', error);
      const errorMessage: Message = {
        role: 'model',
        content: "Sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-indigo-200 dark:shadow-none shadow-lg">
            Z
          </div>
          <h1 className="text-xl font-bold tracking-tight">智学 <span className="text-slate-400 font-normal text-sm ml-2 hidden sm:inline">智能导师</span></h1>
        </div>
        <button 
          onClick={clearChat}
          className="p-2 text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          title="清空对话"
        >
          <Trash2 size={20} />
        </button>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth" {...getRootProps()}>
        <input {...getInputProps()} />
        {isDragActive && (
          <div className="absolute inset-0 bg-indigo-500/10 backdrop-blur-sm z-50 flex items-center justify-center border-4 border-indigo-500 border-dashed m-4 rounded-2xl pointer-events-none">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-xl">
              <p className="text-xl font-bold text-indigo-600">拖放图片、视频或PDF文件上传</p>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center space-y-6 text-slate-400 mt-10"
            >
              <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-3xl shadow-xl flex items-center justify-center mb-2 ring-1 ring-slate-900/5">
                <Send className="w-10 h-10 text-indigo-500" />
              </div>
              <div className="max-w-md space-y-2">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">欢迎使用智学</h2>
                <p className="text-slate-500 dark:text-slate-400">
                  您的多模态 AI 学习助手。
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left">
                {[
                  "帮我解这道数学题（上传图片）",
                  "简单解释量子物理",
                  "总结这份历史 PDF",
                  "翻译这段录音"
                ].map((suggestion, i) => (
                  <button 
                    key={i}
                    onClick={() => setInput(suggestion)}
                    className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((msg, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] md:max-w-[80%] rounded-2xl p-4 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-none'
                }`}
              >
                {/* Render User Attachments */}
                {msg.role === 'user' && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {msg.files?.map((file, i) => (
                      <div key={i} className="bg-white/20 backdrop-blur-sm rounded-lg p-2 text-xs flex items-center gap-2 border border-white/10">
                        {file.type.startsWith('image/') ? <ImageIcon size={14} /> : <FileText size={14} />}
                        <span className="truncate max-w-[150px] font-medium">{file.name}</span>
                      </div>
                    ))}
                    {msg.audioBlob && (
                      <div className="bg-white/20 backdrop-blur-sm rounded-lg p-2 text-xs flex items-center gap-2 border border-white/10">
                        <Mic size={14} />
                        <span className="font-medium">录音</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Render Message Content */}
                <div className={`prose ${msg.role === 'user' ? 'prose-invert' : 'prose-slate dark:prose-invert'} max-w-none text-sm md:text-base leading-relaxed break-words`}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                      // Custom link renderer for grounding sources if they appear in text
                      a: ({ node, ...props }) => (
                        <a {...props} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline inline-flex items-center gap-0.5">
                          {props.children} <ExternalLink size={10} />
                        </a>
                      )
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>

                {/* Render Learning Path if present */}
                {msg.learningPath && (
                  <LearningPath 
                    topic={msg.learningPath.topic}
                    goal={msg.learningPath.goal}
                    steps={msg.learningPath.steps}
                    onStepComplete={(stepIndex, completed) => updateLearningPathProgress(index, stepIndex, completed)}
                    onStartExercise={handleStartExercise}
                  />
                )}

                {/* Render Grounding Metadata (Sources) */}
                {msg.groundingMetadata?.groundingChunks && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">来源</p>
                    <div className="flex flex-wrap gap-2">
                      {msg.groundingMetadata.groundingChunks.map((chunk: any, i: number) => {
                        if (chunk.web?.uri) {
                          return (
                            <a 
                              key={i} 
                              href={chunk.web.uri} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-1 truncate max-w-[200px]"
                            >
                              <ExternalLink size={10} />
                              {chunk.web.title || new URL(chunk.web.uri).hostname}
                            </a>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-3">
                <div className="flex space-x-1">
                  <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-indigo-500 rounded-full" />
                  <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-indigo-500 rounded-full" />
                  <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-indigo-500 rounded-full" />
                </div>
                <span className="text-sm text-slate-500 font-medium">思考中...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-4">
        <div className="max-w-4xl mx-auto">
          {/* File Previews */}
          {(files.length > 0 || audioBlob) && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
              {files.map((file, index) => (
                <div key={index} className="relative group bg-slate-100 dark:bg-slate-700 rounded-xl p-2 flex items-center gap-3 min-w-[160px] border border-slate-200 dark:border-slate-600">
                  {file.type.startsWith('image/') ? (
                    <div className="w-10 h-10 bg-slate-200 rounded-lg overflow-hidden flex-shrink-0">
                      <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover" />
                    </div>
                  ) : file.type.startsWith('video/') ? (
                    <div className="w-10 h-10 bg-slate-900 rounded-lg overflow-hidden flex-shrink-0 relative group-video">
                      <video src={URL.createObjectURL(file)} className="w-full h-full object-cover opacity-50" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Video size={16} className="text-white" />
                      </div>
                    </div>
                  ) : file.type === 'application/pdf' ? (
                    <div className="w-10 h-10 bg-red-100 dark:bg-red-900/50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-red-500" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-indigo-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-slate-700 dark:text-slate-200">{file.name}</p>
                    <p className="text-[10px] text-slate-500 uppercase">{file.type.split('/')[1] || 'FILE'}</p>
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {audioBlob && (
                <div className="relative group bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-xl p-2 flex items-center gap-3 min-w-[160px]">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center flex-shrink-0 animate-pulse">
                    <Mic className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-indigo-900 dark:text-indigo-100">录音</p>
                    <p className="text-[10px] text-indigo-500">准备发送</p>
                  </div>
                  <button
                    onClick={() => setAudioBlob(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-700 p-2 rounded-3xl shadow-inner">
            {/* Attachment Buttons */}
            <div className="flex gap-1">
              <button
                onClick={open}
                className="p-3 text-slate-500 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-600 rounded-full transition-all"
                title="上传文件 (图片, 视频, PDF)"
              >
                <Paperclip size={20} />
              </button>
              
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`p-3 rounded-full transition-all ${
                  isRecording 
                    ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' 
                    : 'text-slate-500 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-600'
                }`}
                title={isRecording ? "停止录音" : "开始录音"}
              >
                {isRecording ? <StopCircle size={20} /> : <Mic size={20} />}
              </button>
            </div>

            {/* Text Input */}
            <div className="flex-1 py-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={isRecording ? "正在听..." : "问点什么..."}
                className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[24px] py-1 text-sm md:text-base outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                rows={1}
                style={{ height: 'auto', minHeight: '24px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={(!input.trim() && files.length === 0 && !audioBlob) || isLoading}
              className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-indigo-600/30"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
          <p className="text-center text-[10px] text-slate-400 mt-2">
            智学使用 Gemini AI。请核实重要信息。
          </p>
        </div>
      </div>
    </div>
  );
}
