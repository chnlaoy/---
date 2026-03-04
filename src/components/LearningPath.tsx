import React, { useState } from 'react';
import { CheckCircle2, Circle, BookOpen, Video, PenTool, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'framer-motion';

export interface LearningStep {
  title: string;
  description: string;
  type: 'article' | 'video' | 'exercise';
  url?: string;
  completed?: boolean;
}

export interface LearningPathProps {
  topic: string;
  goal: string;
  steps: LearningStep[];
  onStepComplete: (index: number, completed: boolean) => void;
  onStartExercise?: (step: LearningStep) => void;
}

export function LearningPath({ topic, goal, steps, onStepComplete, onStartExercise }: LearningPathProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const getIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video size={20} className="text-blue-500" />;
      case 'exercise': return <PenTool size={20} className="text-green-500" />;
      default: return <BookOpen size={20} className="text-orange-500" />;
    }
  };

  const completedCount = steps.filter(s => s.completed).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md my-6 w-full max-w-3xl mx-auto">
      <div 
        className="p-5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>🎓 学习路径: {topic}</span>
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{goal}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{progress}%</div>
            <div className="w-24 h-2 bg-slate-200 dark:bg-slate-600 rounded-full mt-1.5 overflow-hidden">
              <div 
                className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          {isExpanded ? <ChevronUp size={24} className="text-slate-400" /> : <ChevronDown size={24} className="text-slate-400" />}
        </div>
      </div>

      <motion.div 
        initial={false}
        animate={{ height: isExpanded ? 'auto' : 0 }}
        className="overflow-hidden"
      >
        <div className="p-5 space-y-4">
          {steps.map((step, index) => (
            <div 
              key={index} 
              className={`flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 ${
                step.completed 
                  ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50 opacity-75' 
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-sm'
              }`}
            >
              <button 
                onClick={() => onStepComplete(index, !step.completed)}
                className={`mt-1 flex-shrink-0 transition-colors ${
                  step.completed ? 'text-green-500' : 'text-slate-300 hover:text-slate-400'
                }`}
              >
                {step.completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
              </button>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-md">
                    {getIcon(step.type)}
                  </div>
                  <h4 className={`font-semibold text-base ${step.completed ? 'line-through text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
                    {step.title}
                  </h4>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 border border-slate-200 dark:border-slate-600 px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-700/50">
                    {step.type === 'article' ? '文章' : step.type === 'video' ? '视频' : '练习'}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
                  {step.description}
                </p>
                
                <div className="flex gap-3">
                  {step.url && (
                    <a 
                      href={step.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline flex items-center gap-1.5"
                    >
                      <ExternalLink size={14} />
                      查看资源
                    </a>
                  )}
                  {step.type === 'exercise' && !step.completed && (
                    <button
                      onClick={() => onStartExercise?.(step)}
                      className="text-sm font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1.5"
                    >
                      <PenTool size={14} />
                      开始练习
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
