import { AuthProvider, useAuth } from "./contexts/AuthContext";

const Inner = () => {
  const { loading } = useAuth();
  return (
    <div style={{
      color: 'white',
      background: loading ? 'orange' : 'green',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '2rem'
    }}>
      {loading ? "⏳ Auth lädt..." : "✅ Auth OK"}
    </div>
  );
};

const App = () => (
  <AuthProvider>
    <Inner />
  </AuthProvider>
);

export default App;
