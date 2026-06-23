import LogTable from './components/LogTable';
import MappingEditor from './components/MappingEditor';
import StatusCard from './components/StatusCard';
import WatiContacts from './components/WatiContacts';

export default function App() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-800">Wati → HubSpot Sync</h1>
        <p className="text-sm text-slate-500">
          Pushes <code className="rounded bg-slate-100 px-1">source_url</code> into HubSpot when a
          lead hits Wati. Everything else stays with the native Wati↔HubSpot integration.
        </p>
      </header>
      <StatusCard />
      <MappingEditor />
      <WatiContacts />
      <LogTable />
    </div>
  );
}
