import { HashRouter, Routes, Route } from "react-router-dom";

const App = () => (
  <HashRouter>
    <Routes>
      <Route path="/" element={
        <div style={{ color:'white', background:'green', minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'1rem', fontSize:'1.5rem' }}>
          <div>✅ Route / – kein Redirect, kein Auth</div>
          <div style={{fontSize:'1rem'}}>Hash: {window.location.hash || "(leer)"}</div>
        </div>
      } />
      <Route path="*" element={
        <div style={{ color:'white', background:'red', minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'1rem', fontSize:'1.5rem' }}>
          <div>❌ Redirect zu: {window.location.hash}</div>
          <div style={{fontSize:'1rem'}}>Pfad: {window.location.pathname}</div>
        </div>
      } />
    </Routes>
  </HashRouter>
);

export default App;
