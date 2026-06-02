import { redirect } from "next/navigation";
import CopyWorkoutButton from "app/components/CopyWorkoutButton.jsx";
import DistanceChart from "app/components/DistanceChart.jsx";
import UploadForm from "app/components/UploadForm.jsx";
import { hasDashboardCookie, isConfiguredForProduction } from "lib/auth.js";
import { getLatestActivity } from "lib/blob-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }) {
  const params = await searchParams;
  if (params?.key) redirect(`/api/auth?key=${encodeURIComponent(params.key)}`);

  const isAuthed = await hasDashboardCookie();
  if (!isAuthed) return <UnlockScreen />;

  const summary = await getLatestActivity();

  return (
    <main>
      <div className="dashboard">
        <Topbar summary={summary} />
        {summary ? <ActivitySummary summary={summary} /> : <EmptyState />}
      </div>
    </main>
  );
}

function UnlockScreen() {
  return (
    <main>
      <div className="dashboard unlock">
        <h1>Activity Summary</h1>
        <p className="note">Enter the shared dashboard secret to view or upload FIT files.</p>
        <form className="unlock-form" action="/" method="get">
          <input name="key" type="password" placeholder="Shared secret" autoComplete="current-password" />
          <button className="primary" type="submit">Unlock</button>
        </form>
        {!isConfiguredForProduction() ? (
          <p className="note">Local dev default secret: <code>dev-secret</code></p>
        ) : null}
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
        <UploadForm />
        <CopyWorkoutButton summary={summary} />
        <form className="clear-form" action="/api/clear" method="post">
          <button className="danger" type="submit" disabled={!filename}>Clear</button>
        </form>
      </div>
    </div>
  );
}

function ActivitySummary({ summary }) {
  const detailCards = [
    ["Activity", summary.details.activity],
    ["Date", summary.details.date, "date"],
  ];
  const metricCards = [
    ["Duration", summary.metrics.duration.value, summary.metrics.duration.unit],
    ["Distance", summary.metrics.distance.value, summary.metrics.distance.unit],
    ["Avg Pace", summary.metrics.avgPace.value, summary.metrics.avgPace.unit],
    ["Avg HR", summary.metrics.avgHeartRate.value, summary.metrics.avgHeartRate.unit],
    ["Max HR", summary.metrics.maxHeartRate.value, summary.metrics.maxHeartRate.unit],
    ["Avg Speed", summary.metrics.avgSpeed.value, summary.metrics.avgSpeed.unit],
    ["Max Speed", summary.metrics.maxSpeed.value, summary.metrics.maxSpeed.unit],
    ["Avg Power", summary.metrics.avgPower.value, summary.metrics.avgPower.unit],
    ["Max Power", summary.metrics.maxPower.value, summary.metrics.maxPower.unit],
    ["Elevation", summary.metrics.elevation.value, summary.metrics.elevation.unit],
    ["Calories", summary.metrics.calories.value, summary.metrics.calories.unit],
    ["Avg Cadence", summary.metrics.avgCadence.value, summary.metrics.avgCadence.unit],
  ];

  return (
    <>
      <section>
        <h2>Details</h2>
        <div className="details">
          {detailCards.map(([label, value, type]) => (
            <div key={label}>
              <div className="label">{label}</div>
              <div className={`detail-value${type === "date" ? " date-value" : ""}`}>{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Metrics</h2>
        <div className="metrics">
          {metricCards.map(([label, value, unit]) => (
            <div className="metric-card" key={label}>
              <div className="label">{label}</div>
              <div className="metric-value">{value}</div>
              <div className="unit">{unit}</div>
            </div>
          ))}
        </div>
      </section>

      {summary.chart ? <DistanceChart chart={summary.chart} /> : null}
      <Laps laps={summary.laps} />
    </>
  );
}

function Laps({ laps }) {
  if (!laps?.length) return null;

  return (
    <section>
      <details className="laps-panel" open>
        <summary>
          <span className="laps-title"><span className="flag" aria-hidden="true">⚑</span>Laps <span className="row-count">({laps.length} rows)</span></span>
          <span className="chevron" aria-hidden="true" />
        </summary>
        <div className="laps-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Duration</th>
                <th>Distance</th>
                <th>Avg Speed</th>
                <th>Max Speed</th>
                <th>Avg HR</th>
                <th>Max HR</th>
                <th>Avg Cadence</th>
              </tr>
            </thead>
            <tbody>
              {laps.map((lap) => (
                <tr key={lap.index}>
                  <td>{lap.index}</td>
                  <td>{lap.duration}</td>
                  <td>{lap.distance}</td>
                  <td>{lap.avgSpeed}</td>
                  <td>{lap.maxSpeed}</td>
                  <td>{lap.avgHeartRate}</td>
                  <td>{lap.maxHeartRate}</td>
                  <td>{lap.avgCadence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
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
