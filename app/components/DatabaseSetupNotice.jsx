export default function DatabaseSetupNotice() {
  return (
    <main>
      <div className="dashboard unlock">
        <h1>Database Setup Required</h1>
        <p className="note">Set <code>DATABASE_URL</code> to a Neon Postgres connection string, then run <code>npm run db:init</code>.</p>
      </div>
    </main>
  );
}
