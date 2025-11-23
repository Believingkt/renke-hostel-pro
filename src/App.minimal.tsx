import * as React from "react";

export default function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>React is working!</h1>
      <p>If you can see this, React has loaded successfully.</p>
      <p>Current time: {new Date().toLocaleString()}</p>
    </div>
  );
}
