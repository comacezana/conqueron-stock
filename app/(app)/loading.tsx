export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="sk" style={{ width: 180, height: 28, marginBottom: 24 }} />
      <div className="sk" style={{ height: 48, marginBottom: 16 }} />
      <div style={{ display: "grid", gap: 10 }}>
        {Array.from({ length: 9 }, (_, i) => <div key={i} className="sk" style={{ height: 44 }} />)}
      </div>
    </div>
  );
}
