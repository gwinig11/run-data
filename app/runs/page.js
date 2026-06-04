import Link from "next/link";
import { redirect } from "next/navigation";
import DatabaseSetupNotice from "app/components/DatabaseSetupNotice.jsx";
import UnlockScreen from "app/components/UnlockScreen.jsx";
import { hasDashboardCookie } from "lib/auth.js";
import { hasDatabaseUrl } from "lib/db.js";
import { countRuns, listRuns } from "lib/run-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function RunsPage({ searchParams }) {
  const params = await searchParams;
  if (params?.key) redirect(`/api/auth?key=${encodeURIComponent(params.key)}`);

  const isAuthed = await hasDashboardCookie();
  if (!isAuthed) return <UnlockScreen />;
  if (!hasDatabaseUrl()) return <DatabaseSetupNotice />;

  const page = Math.max(1, Number.parseInt(params?.page || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const [runs, total] = await Promise.all([
    listRuns({ limit: PAGE_SIZE, offset }),
    countRuns(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main>
      <div className="dashboard">
        <div className="topbar">
          <div>
            <h1>Run History</h1>
            <div className="meta">{total ? `${total} stored ${total === 1 ? "run" : "runs"}` : "No runs stored yet."}</div>
          </div>
          <div className="actions">
            <Link className="action-button" href="/dashboard">Dashboard</Link>
            <Link className="action-button" href="/">Latest</Link>
          </div>
        </div>

        {runs.length ? <RunTable runs={runs} /> : <EmptyHistory />}
        {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} /> : null}
      </div>
    </main>
  );
}

function RunTable({ runs }) {
  return (
    <section className="history-section">
      <div className="history-scroll">
        <table className="history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Activity</th>
              <th>Distance</th>
              <th>Duration</th>
              <th>Avg Pace</th>
              <th>Avg HR</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.file.id}>
                <td><Link href={`/runs/${run.file.id}`}>{run.details?.date || formatDate(run.file.uploadedAt)}</Link></td>
                <td>{run.details?.activity || "Activity"}</td>
                <td>{metricText(run.metrics?.distance)}</td>
                <td>{metricText(run.metrics?.duration)}</td>
                <td>{metricText(run.metrics?.avgPace)}</td>
                <td>{metricText(run.metrics?.avgHeartRate)}</td>
                <td className="filename-cell">{run.file.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Pagination({ page, totalPages }) {
  return (
    <nav className="pagination" aria-label="Run history pages">
      <Link className="action-button" href={`/runs?page=${page - 1}`} aria-disabled={page <= 1}>Previous</Link>
      <span className="meta">Page {page} of {totalPages}</span>
      <Link className="action-button" href={`/runs?page=${page + 1}`} aria-disabled={page >= totalPages}>Next</Link>
    </nav>
  );
}

function EmptyHistory() {
  return (
    <div className="empty">
      <div>
        <h2>No Stored Runs</h2>
        <p className="note">Upload a FIT file or let Make.com post one to <strong>/api/webhook/fit</strong>.</p>
      </div>
    </div>
  );
}

function metricText(metric) {
  if (!metric) return "-";
  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
