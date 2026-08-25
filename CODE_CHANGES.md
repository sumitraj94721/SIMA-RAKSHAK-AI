// ============================================
// COMPLETE UPDATED APP.TSX
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { apiService, CameraFeed, HeatmapPoint } from './api';

type Alert = {
  id: string;
  time: string;
  severity: 'green' | 'yellow' | 'red';
  title: string;
  message: string;
  feed: string;
};

const demoAlerts: Alert[] = [
  {
    id: 'a1',
    time: 'Now',
    severity: 'red',
    title: 'Unauthorized entry detected',
    message: 'Person crossed the secure perimeter at the south gate.',
    feed: 'Parking Entrance',
  },
  {
    id: 'a2',
    time: '1 min ago',
    severity: 'yellow',
    title: 'Loitering behavior',
    message: 'Individual remained in the loading dock for 42 seconds.',
    feed: 'Loading Dock',
  },
  {
    id: 'a3',
    time: '3 min ago',
    severity: 'green',
    title: 'Routine staff movement',
    message: 'Verified access from the main lobby.',
    feed: 'Entrance Lobby',
  },
];

const initialHeatmap: HeatmapPoint[] = [
  { zone: 'Zone A', intensity: 70, label: 'main corridor' },
  { zone: 'Zone B', intensity: 48, label: 'vehicle access' },
  { zone: 'Zone C', intensity: 88, label: 'storage bay' },
  { zone: 'Zone D', intensity: 34, label: 'service entrance' },
];

const feedBoxes = [
  { id: 'box-1', label: 'Person', left: '16%', top: '24%', width: '24%', height: '18%', color: 'rgba(255,65,108,0.45)' },
  { id: 'box-2', label: 'Suspicious object', left: '58%', top: '52%', width: '20%', height: '16%', color: 'rgba(255,184,0,0.35)' },
];

export default function App() {
  const [feeds, setFeeds] = useState<CameraFeed[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>(initialHeatmap);
  const [alerts, setAlerts] = useState<Alert[]>(demoAlerts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerting, setAlerting] = useState(false);

  // Fetch cameras and heatmap data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        const [camerasData, heatmapData] = await Promise.all([
          apiService.getCameras(),
          apiService.getHeatmap(),
        ]);
        setFeeds(camerasData);
        setHeatmap(heatmapData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to connect to backend API. Make sure the backend is running on http://127.0.0.1:8000');
        setLoading(false);
      }
    };

    fetchData();

    // Set up real-time polling (refresh every 4 seconds)
    const interval = setInterval(() => {
      Promise.all([
        apiService.getCameras(),
        apiService.getHeatmap(),
      ])
        .then(([camerasData, heatmapData]) => {
          setFeeds(camerasData);
          setHeatmap(heatmapData);
        })
        .catch((err) => {
          console.error('Error fetching updated data:', err);
        });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Calculate statistics from real camera data
  const stats = useMemo(() => {
    const activeCameras = feeds.length;
    const criticalAlerts = feeds.reduce((sum, cam) => sum + cam.alerts, 0);
    const suspiciousEvents = Math.round(
      heatmap.reduce((sum, point) => sum + point.intensity, 0) / (heatmap.length || 1)
    );

    return {
      cameras: activeCameras,
      critical: criticalAlerts,
      suspicious: suspiciousEvents,
    };
  }, [feeds, heatmap]);

  const activeAlerts = alerts.slice(0, 6);

  // Trigger demo alert with backend detection
  const simulateAlert = async () => {
    setAlerting(true);
    try {
      const detection = await apiService.triggerDetection();
      
      const severityMap: Record<string, 'green' | 'yellow' | 'red'> = {
        'None': 'green',
        'Weapon': 'red',
        'Intrusion': 'yellow',
      };

      const severity = severityMap[detection.threat] || 'green';

      setAlerts((prev) => [
        {
          id: `a${Date.now()}`,
          time: 'Now',
          severity: severity,
          title: `AI Detection: ${detection.threat === 'None' ? 'Normal Activity' : detection.threat}`,
          message: `Threat detection with ${detection.confidence}% confidence at ${new Date().toLocaleTimeString()}.`,
          feed: feeds.length > 0 ? feeds[0].label : 'Unknown',
        },
        ...prev.slice(0, 5),
      ]);
    } catch (err) {
      console.error('Error triggering detection:', err);
      alert('Failed to trigger detection. Check if backend is running.');
    } finally {
      setAlerting(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SentriAI Command Center</p>
          <h1>AI-Driven Security Surveillance</h1>
          <p className="subtitle">Real-time threat visibility, behavior scoring, and intelligent incident response.</p>
          {error && (
            <p style={{ color: '#ff4166', marginTop: '8px', fontSize: '14px' }}>
              ⚠️ {error}
            </p>
          )}
          {loading && (
            <p style={{ color: '#888', marginTop: '8px', fontSize: '14px' }}>
              ⏳ Loading data from backend...
            </p>
          )}
        </div>
        <button 
          className="primary-button" 
          onClick={simulateAlert}
          disabled={alerting}
          style={{ opacity: alerting ? 0.6 : 1, cursor: alerting ? 'not-allowed' : 'pointer' }}
        >
          {alerting ? 'Detecting...' : 'Trigger demo alert'}
        </button>
      </header>

      <section className="status-row">
        <div className="stat-card">
          <div className="stat-title">Active Cameras</div>
          <div className="stat-value">{loading ? '...' : stats.cameras}</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-title">Critical Alerts</div>
          <div className="stat-value">{loading ? '...' : stats.critical}</div>
        </div>
        <div className="stat-card accent">
          <div className="stat-title">Suspicious Events</div>
          <div className="stat-value">{loading ? '...' : stats.suspicious}%</div>
        </div>
      </section>

      <main className="dashboard-grid">
        <section className="panel live-feed-panel">
          <div className="panel-header">
            <div>
              <h2>Live camera intelligence</h2>
              <p>Multi-zone view with real-time threat annotations.</p>
            </div>
            <span className="badge green">Live</span>
          </div>
          {feeds.length > 0 ? (
            <>
              <div className="live-feed-card">
                <div className="feed-header">
                  <div>
                    <p className="feed-label">{feeds[0].label}</p>
                    <p className="feed-subtitle">Edge inference stream • {feeds[0].location}</p>
                  </div>
                  <div className={`status-pill ${feeds[0].threatScore > 70 ? 'red' : feeds[0].threatScore > 40 ? 'yellow' : 'green'}`}>
                    {feeds[0].status}
                  </div>
                </div>
                <div className="camera-frame">
                  <div className="camera-overlay">
                    {feedBoxes.map((box) => (
                      <div key={box.id} className="overlay-box" style={{ left: box.left, top: box.top, width: box.width, height: box.height, borderColor: box.color }}>
                        <span>{box.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="frame-label">Entrance zone analytics</div>
                </div>
              </div>

              <div className="highlights-row">
                <div className={`highlight-card ${feeds[0].threatScore > 70 ? 'red' : feeds[0].threatScore > 40 ? 'yellow' : 'green'}`}>
                  <div>Threat score</div>
                  <div className="highlight-value">{feeds[0].threatScore}%</div>
                </div>
                <div className="highlight-card yellow">
                  <div>Active alerts</div>
                  <div className="highlight-value">{feeds[0].alerts}</div>
                </div>
                <div className="highlight-card green">
                  <div>Cameras online</div>
                  <div className="highlight-value">{feeds.length}</div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              {loading ? 'Loading camera feeds...' : 'No camera feeds available'}
            </div>
          )}
        </section>

        <section className="panel alert-panel">
          <div className="panel-header">
            <div>
              <h2>Real-time alert timeline</h2>
              <p>Priority incidents ranked by threat score.</p>
            </div>
          </div>
          <div className="alerts-list">
            {activeAlerts.map((alert) => (
              <article key={alert.id} className={`alert-item ${alert.severity}`}>
                <div className="alert-meta">
                  <p className="alert-title">{alert.title}</p>
                  <span className="alert-time">{alert.time}</span>
                </div>
                <p className="alert-message">{alert.message}</p>
                <div className="alert-footer">
                  <span className="badge small">{alert.feed}</span>
                  <span className={`badge small ${alert.severity}`}>{alert.severity.toUpperCase()}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel heatmap-panel">
          <div className="panel-header">
            <div>
              <h2>Suspicious activity heatmap</h2>
              <p>Density intensity for active zones.</p>
            </div>
            <span className="badge">Analytics</span>
          </div>
          <div className="heatmap-grid">
            {heatmap.map((point) => (
              <div key={point.zone} className="heatmap-card">
                <div className="heatmap-label">{point.zone}</div>
                <div className="heatmap-bar">
                  <div className="heatmap-fill" style={{ width: `${point.intensity}%` }} />
                </div>
                <div className="heatmap-meta">{point.intensity}% · {point.label}</div>
              </div>
            ))}
          </div>
          {loading && (
            <div style={{ padding: '10px', textAlign: 'center', color: '#888', fontSize: '12px' }}>
              Updating from API...
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
