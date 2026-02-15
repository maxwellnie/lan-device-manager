function TestApp() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#ff0000', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      flexDirection: 'column',
      padding: '20px'
    }}>
      <h1 style={{ color: 'white', fontSize: '24px' }}>TEST APP</h1>
      <p style={{ color: 'white' }}>If you see this, React is working!</p>
    </div>
  );
}

export default TestApp;
