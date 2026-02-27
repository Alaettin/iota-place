import { useState, useEffect } from "react";

function App() {
  const [health, setHealth] = useState<string>("...");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => setHealth(data.ok ? "Connected" : "Error"))
      .catch(() => setHealth("Offline"));
  }, []);

  return (
    <div style={{ textAlign: "center", marginTop: "20vh", fontFamily: "sans-serif" }}>
      <h1>IOTA Place</h1>
      <p>Server: {health}</p>
    </div>
  );
}

export default App;
