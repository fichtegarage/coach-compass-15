import { useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";

const Inner = () => {
  const [swStatus, setSwStatus] = useState("prüfe...");

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        if (regs.length === 0) {
          setSwStatus("Kein SW aktiv");
        } else {
          Promise.all(regs.map(r => r.unregister())).then(() => {
            setSwStatus(`${regs.length} SW deregistriert – bitte Seite neu laden!`);
          });
        }
      });
    } else {
      setSwStatus("SW nicht unterstützt");
    }
  }, []);

  return (
    <Routes>
      <Route path="/" element={
        <div style={{ color:'white', background:'green', minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'1rem', fontSize:'1.5rem' }}>
          <div>✅ Route / – kein Redirect</div>
          <div style={{ fontSize:'1rem' }}>SW: {swStatus}</div>
        </div>
      } />
      <Route path="*" element={
        <div style={{ color:'white', background:'red', minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'1rem', fontSize:'1.5rem' }}>
          <div>❌ Umgeleitet zu: {window.location.hash}</div>
          <div style={{ fontSize:'1rem' }}>SW: {swStatus}</div>
        </div>
      } />
    </Routes>
  );
};

const App = () => (
  <AuthProvider>
    <HashRouter>
      <Inner />
    </HashRouter>
  </AuthProvider>
);

export default App;
