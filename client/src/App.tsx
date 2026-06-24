import { useState } from 'react';
import LiveInbox from './components/LiveInbox';
import LogTable from './components/LogTable';
import MappingEditor from './components/MappingEditor';
import SettingsModal from './components/SettingsModal';
import StatusCard from './components/StatusCard';
import WatiContacts from './components/WatiContacts';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bump to force child cards (e.g. StatusCard) to re-check after saving settings.
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Wati → HubSpot Sync</h1>
          <p className="text-sm text-slate-500">
            Pushes <code className="rounded bg-slate-100 px-1">source_url</code> into HubSpot when a
            lead hits Wati. Everything else stays with the native Wati↔HubSpot integration.
          </p>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Settings"
          title="Settings"
        >
          <GearIcon />
        </button>
      </header>
      <StatusCard key={refreshKey} />
      <MappingEditor />
      <LiveInbox />
      <WatiContacts />
      <LogTable />

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
