import { isConfiguredForProduction } from "lib/auth.js";

export default function UnlockScreen() {
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
