import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ActivitySummary from "app/components/ActivitySummary.jsx";
import CopyWorkoutButton from "app/components/CopyWorkoutButton.jsx";
import DatabaseSetupNotice from "app/components/DatabaseSetupNotice.jsx";
import UnlockScreen from "app/components/UnlockScreen.jsx";
import UploadForm from "app/components/UploadForm.jsx";
import { hasDashboardCookie } from "lib/auth.js";
import { hasDatabaseUrl } from "lib/db.js";
import { getRunById } from "lib/run-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params, searchParams }) {
  const query = await searchParams;
  if (query?.key) redirect(`/api/auth?key=${encodeURIComponent(query.key)}`);

  const isAuthed = await hasDashboardCookie();
  if (!isAuthed) return <UnlockScreen />;
  if (!hasDatabaseUrl()) return <DatabaseSetupNotice />;

  const { id } = await params;
  const summary = await getRunById(id);
  if (!summary) notFound();

  return (
    <main>
      <div className="dashboard">
        <div className="topbar">
          <div>
            <h1>{summary.details?.activity || "Run Detail"}</h1>
            <div className="meta">{summary.details?.date || summary.file.uploadedAt}</div>
          </div>
          <div className="actions">
            <Link className="action-button" href="/runs">History</Link>
            <Link className="action-button" href="/">Latest</Link>
            <a className="action-button" href={summary.file.rawUrl}>FIT</a>
            <UploadForm />
            <CopyWorkoutButton summary={summary} />
          </div>
        </div>
        <ActivitySummary summary={summary} />
      </div>
    </main>
  );
}
