'use client';

import React from 'react';

// 音声波形コンポーネント
export default function Waveform({ isRecording }: { isRecording: boolean }) {
  return (
    <div className="flex items-center justify-center h-16 mt-4 mb-6">
      {isRecording ? (
        <div className="flex items-end space-x-1">
          {Array.from({ length: 20 }).map((_, i) => {
            const height = Math.max(10, Math.floor(Math.random() * 40));
            return (
              <div
                key={i}
                className={`w-1.5 bg-gradient-to-t from-indigo-400 to-purple-500 rounded-full animate-pulse`}
                style={{
                  height: `${height}px`,
                  animationDelay: `${i * 0.05}s`,
                  animationDuration: `${0.5 + Math.random() * 0.5}s`
                }}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex items-end space-x-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-2 bg-indigo-100 rounded-full"
            />
          ))}
        </div>
      )}
    </div>
  );
} 