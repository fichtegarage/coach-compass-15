import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

const Inner = () => {
  const { loading } = useAuth();
  if (loading) return (
    <div style={{ color:'white', background:'orange', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem' }}>
      ⏳ Auth lädt...
    </div>
  );
  return (
    <Routes>
      <Route path="/" element={
        <div style={{ color:'white', background:'green', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem' }}>
          ✅ Route / gefunden – kein Redirect
        </div>
      } />
      <Route path="*" element={
        <div style={{ color:'white', background:'red', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem' }}>
          ❌ Umgeleitet zu: {window.location.hash}
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
