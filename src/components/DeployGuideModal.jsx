import React, { useState } from 'react';
import { X, Check, Copy, ExternalLink, Terminal, Globe, Rocket } from 'lucide-react';

export default function DeployGuideModal({ onClose }) {
  const [copied, setCopied] = useState(false);

  const gitCommands = `git add .
git commit -m "feat: PokéScan Live web app"
git push origin main`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(gitCommands);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 backdrop-blur-md bg-slate-950/85 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 text-white border border-slate-700">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Déploiement GitHub Pages</h3>
              <p className="text-xs text-slate-400">Publiez votre application en ligne gratuitement en 2 minutes</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-slate-300 text-xs sm:text-sm">
          
          {/* Step 1 */}
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-red-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
              1
            </div>
            <div className="space-y-2 flex-1">
              <h4 className="font-bold text-white text-sm">Pousser le code sur votre dépôt GitHub</h4>
              <p className="text-xs text-slate-400">
                Ouvrez votre terminal dans le dossier du projet et exécutez les commandes suivantes :
              </p>
              
              <div className="relative rounded-2xl bg-slate-950 border border-slate-800 p-3 font-mono text-xs text-emerald-400">
                <pre>{gitCommands}</pre>
                <button
                  onClick={copyToClipboard}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 border border-slate-700"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copié !' : 'Copier'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">
              2
            </div>
            <div className="space-y-1.5 flex-1">
              <h4 className="font-bold text-white text-sm">Activer GitHub Pages dans les réglages</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rendez-vous sur votre dépôt GitHub :
              </p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-slate-300 pl-1">
                <li>Cliquez sur l'onglet <strong>Settings</strong> de votre dépôt GitHub.</li>
                <li>Dans le menu de gauche, cliquez sur <strong>Pages</strong>.</li>
                <li>Sous <strong>Build and deployment</strong>, sélectionnez <strong>Source : GitHub Actions</strong>.</li>
              </ol>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">
              3
            </div>
            <div className="space-y-1.5 flex-1">
              <h4 className="font-bold text-white text-sm">Déploiement Automatique 🚀</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Le workflow automatique <code className="text-amber-400 font-mono">.github/workflows/deploy.yml</code> déjà configuré dans ce projet va compiler et mettre en ligne votre application sur votre URL <code className="text-emerald-400 font-mono">https://votre-pseudo.github.io/votre-depot/</code> !
              </p>
            </div>
          </div>

          {/* Banner PWA / Mobile */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/40 to-slate-900 border border-red-500/20 flex items-center gap-3">
            <Globe className="w-6 h-6 text-red-400 shrink-0" />
            <p className="text-xs text-slate-300">
              Une fois en ligne, vous pouvez ouvrir l'URL sur votre <strong>smartphone (Safari iOS ou Chrome Android)</strong> et cliquer sur <strong>« Ajouter à l'écran d'accueil »</strong> pour l'utiliser comme une vraie application native !
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors"
          >
            Fermer le guide
          </button>
        </div>

      </div>
    </div>
  );
}
