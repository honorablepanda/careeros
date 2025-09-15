export default function Home() {
  return (
    <main style={{padding: 24}}>
      <h1>Home</h1>
      <p>Try the Activity pages:</p>
      <ul>
        <li><a href="/tracker/activity?id=TEST_APP_ID">/tracker/activity?id=TEST_APP_ID</a></li>
        <li><a href="/tracker/TEST_APP_ID/activity">/tracker/TEST_APP_ID/activity</a></li>
      </ul>
    </main>
  );
}
