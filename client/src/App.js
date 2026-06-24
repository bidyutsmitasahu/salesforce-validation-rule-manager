import React, { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, RefreshCw, CloudLightning, CheckCircle, XCircle } from 'lucide-react';

const BACKEND_URL = 'https://salesforce-backend-253g.onrender.com';

function App() {
  const [rules, setRules] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success') {
      setIsLoggedIn(true);
      window.history.replaceState({}, document.title, "/");
      fetchRules();
    }
  }, []);

  const handleLogin = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/oauth/authUrl`);
      const data = await res.json();
      window.location.href = data.url; // Redirect to Salesforce Auth [cite: 2, 5]
    } catch (err) {
      alert('Authentication initialization failed.');
    }
  };

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/validation-rules`);
      const data = await res.json();
      // Map API architecture into local structured state
      setRules(data.map(r => ({
        id: r.Id,
        name: r.ValidationName,
        active: r.Active,
        originalActive: r.Active // Track staging differences
      })));
    } catch (err) {
      alert('Failed fetching validation rules.');
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = (id) => {
    setRules(rules.map(rule => 
      rule.id === id ? { ...rule, active: !rule.active } : rule
    ));
  };

  const deployChanges = async () => {
    setDeploying(true);
    // Filter only modified rules to optimize the deployment payload [cite: 7]
    const dirtyRules = rules.filter(r => r.active !== r.originalActive);
    
    if(dirtyRules.length === 0) {
      alert("No local structural modifications found to deploy.");
      setDeploying(false);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/validation-rules/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: dirtyRules.map(r => ({ id: r.id, active: r.active }))
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Metadata changes deployed to Salesforce successfully!');
        fetchRules();
      }
    } catch (err) {
      alert('Deployment failed.');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', padding: '40px', backgroundColor: '#f4f6f9', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e1e4e8', paddingBottom: '20px' }}>
        <h2>Salesforce Validation Switchboard</h2>
        {!isLoggedIn ? (
          <button onClick={handleLogin} style={{ padding: '10px 20px', backgroundColor: '#0070d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Login to Salesforce Org 
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={fetchRules} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 15px', backgroundColor: '#fff', border: '1px solid #d8ddedd', borderRadius: '4px', cursor: 'pointer' }}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} /> Fetch Rules [cite: 6]
            </button>
            <button onClick={deployChanges} disabled={deploying} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 15px', backgroundColor: '#2e7d32', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              <CloudLightning size={16} /> {deploying ? 'Deploying...' : 'Deploy Changes [cite: 7]'}
            </button>
          </div>
        )}
      </header>

      <main style={{ marginTop: '30px' }}>
        {!isLoggedIn ? (
          <div style={{ textAlign: 'center', padding: '50px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <p style={{ color: '#546e7a' }}>Please log in to capture and alter organization operational parameters.</p>
          </div>
        ) : loading ? (
          <p>Gathering organization configuration schema metadata...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <thead>
              <tr style={{ backgroundColor: '#fafafb', borderBottom: '1px solid #e1e4e8', textAlign: 'left' }}>
                <th style={{ padding: '15px' }}>Rule Target Metadata ID</th>
                <th style={{ padding: '15px' }}>Validation Rule Label Name</th>
                <th style={{ padding: '15px' }}>Live State Status [cite: 6]</th>
                <th style={{ padding: '15px' }}>Staging Action [cite: 6]</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} style={{ borderBottom: '1px solid #e1e4e8' }}>
                  <td style={{ padding: '15px', color: '#546e7a', fontSize: '13px' }}>{rule.id}</td>
                  <td style={{ padding: '15px', fontWeight: '600' }}>{rule.name}</td>
                  <td style={{ padding: '15px' }}>
                    {rule.originalActive ? (
                      <span style={{ color: '#2e7d32', display: 'flex', alignItems: 'center', gap: '5px' }}><CheckCircle size={16}/> Active</span>
                    ) : (
                      <span style={{ color: '#c62828', display: 'flex', alignItems: 'center', gap: '5px' }}><XCircle size={16}/> Inactive</span>
                    )}
                  </td>
                  <td style={{ padding: '15px' }}>
                    <button onClick={() => toggleRule(rule.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: rule.active ? '#0070d2' : '#90a4ae' }}>
                      {rule.active ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

export default App;