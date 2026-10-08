import React from 'react';
import BorderDetectionCamera from './components/BorderDetectionCamera';

export default function App() {
  return (
    <main className="w-full h-full min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <BorderDetectionCamera />
    </main>
  );
}
