import Link from "next/link";
import { redirect } from "next/navigation";
import ActivitySummary from "app/components/ActivitySummary.jsx";
import CopyWorkoutButton from "app/components/CopyWorkoutButton.jsx";
import DatabaseSetupNotice from "app/components/DatabaseSetupNotice.jsx";
import UnlockScreen from "app/components/UnlockScreen.jsx";
import { hasDashboardCookie } from "lib/auth.js";
import { hasDatabaseUrl } from "lib/db.js";
import { getLatestRun } from "lib/run-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }) {
  const params = await searchParams;
  if (params?.key) redirect(`/api/auth?key=${encodeURIComponent(params.key)}`);

  const isAuthed = await hasDashboardCookie();
  if (!isAuthed) return <UnlockScreen />;
  if (!hasDatabaseUrl()) return <DatabaseSetupNotice />;

  const summary = await getLatestRun();

  return (
    <main>
      <div className="dashboard">
        <Topbar summary={summary} />
        {summary ? <ActivitySummary summary={summary} /> : <EmptyState />}
      </div>
    </main>
  );
}

function Topbar({ summary }) {
  const filename = summary?.file?.name;
  return (
    <div className="topbar">
      <div>
        <h1>Activity Summary</h1>
        <div className="meta">{filename || "Upload a FIT file to build the dashboard."}</div>
      </div>
      <div className="actions">
        <Link className="action-button" href="/runs">History</Link>
        <CopyWorkoutButton summary={summary} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <div>
        <h2>Waiting for Upload</h2>
        <p className="note">Choose a FIT file here or POST one from Make.com to <strong>/api/webhook/fit</strong>.</p>
      </div>
    </div>
  );
}
