type Props = {
  /** Column header labels — used to size the skeleton to the real table. */
  columns: string[];
  /** Number of placeholder rows to render. */
  rows?: number;
};

// A shimmering placeholder bar. Widths vary per column so it reads like data.
function Bar({ width }: { width: string }) {
  return <span className="block h-3 rounded bg-slate-200" style={{ width }} />;
}

const WIDTHS = ['70%', '85%', '50%', '60%', '40%', '90%', '65%', '55%', '45%'];

export default function TableSkeleton({ columns, rows = 7 }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            {columns.map((c) => (
              <th key={c} className="py-2 pr-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="animate-pulse">
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-slate-100">
              {columns.map((_, c) => (
                <td key={c} className="py-2.5 pr-3">
                  <Bar width={WIDTHS[c % WIDTHS.length]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
