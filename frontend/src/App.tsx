import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ShieldAlert,
  Radio,
  Activity,
  Wifi,
  WifiOff,
  AlertTriangle,
  Crosshair,
  Eye,
  Server,
  Zap,
  Volume2,
  VolumeX,
  Compass,
  Radar,
  Flame,
  Layers,
  Terminal,
  Video,
  Disc,
  Clock,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

// =============================================================================
// TYPES (Locally Defined for Zero Runtime/Import Errors)
// =============================================================================
export interface ThreatAlert {
  id: string;
  cam_id?: string;
  sector: string;
  threat: string;
  confidence: number;
  threat_level: "CRITICAL" | "WARNING" | "MONITORING";
  geofence_breach: boolean;
  optical_expansion?: boolean;
  timestamp: string;
}

export interface CameraOption {
  id: string;
  name: string;
  coordinates: string;
  type: string;
}

export type ConnectionStatus = "CONNECTING" | "ONLINE / SECURE" | "OFFLINE";

export default function App() {
  // Default camera options
  const [cameras, setCameras] = useState<CameraOption[]>([
    {
      id: "0",
      name: "Sector A (Command Post Webcam)",
      coordinates: "LAT 34.0836° N / LON 74.7973° E",
      type: "OPTICAL_SURVEILLANCE",
    },
    {
      id: "1",
      name: "Sector B (Perimeter Buffer Node)",
      coordinates: "LAT 34.0912° N / LON 74.8021° E",
      type: "BUFFER_ZONE_IR",
    },
  ]);

  const [activeCamId, setActiveCamId] = useState<string>("0");
  const [alerts, setAlerts] = useState<ThreatAlert[]>([
    {
      id: "init-1",
      cam_id: "0",
      sector: "Sector A (Command Post Webcam)",
      threat: "INITIAL_RADAR_LOCK",
      confidence: 99.4,
      threat_level: "WARNING",
      geofence_breach: false,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("CONNECTING");
  const [breachCount, setBreachCount] = useState<number>(0);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [isSOSActive, setIsSOSActive] = useState<boolean>(false);
  const [imgError, setImgError] = useState<boolean>(false);
  const [fpsVal, setFpsVal] = useState<number>(28.4);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Fetch configured cameras from backend
  useEffect(() => {
    fetch("http://127.0.0.1:8000/cameras/list")
      .then((res) => res.json())
      .then((data: CameraOption[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setCameras(data);
        }
      })
      .catch(() => {
        // Retain fallback defaults
      });
  }, []);

  // Tactical Web Audio Synthesizer
  const playTacticalAlarm = useCallback(
    (isCritical: boolean) => {
      if (audioMuted) return;
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = isCritical ? "sawtooth" : "sine";
        osc.frequency.setValueAtTime(isCritical ? 880 : 540, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(isCritical ? 440 : 720, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } catch (err) {
        // Audio policy or fallback
      }
    },
    [audioMuted]
  );

  // Live FPS variance effect
  useEffect(() => {
    const fpsTimer = setInterval(() => {
      setFpsVal(Number((27.5 + Math.random() * 2.2).toFixed(1)));
    }, 2000);
    return () => clearInterval(fpsTimer);
  }, []);

  // WebSocket Connection Lifecycle
  useEffect(() => {
    let unmounted = false;

    const connectWebSocket = () => {
      if (unmounted) return;
      const wsUrl = "ws://127.0.0.1:8000/ws/alerts";
      setConnectionStatus("CONNECTING");

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setConnectionStatus("ONLINE / SECURE");
      };

      ws.onmessage = (event) => {
        if (unmounted) return;
        try {
          const raw = JSON.parse(event.data);
          const newAlert: ThreatAlert = {
            id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            cam_id: raw.cam_id || "0",
            sector: raw.sector || "Sector A (Command Post Webcam)",
            threat: raw.threat || "UNKNOWN_TARGET",
            confidence: typeof raw.confidence === "number" ? raw.confidence : 95.0,
            threat_level: raw.threat_level === "CRITICAL" ? "CRITICAL" : "WARNING",
            geofence_breach: Boolean(raw.geofence_breach),
            optical_expansion: Boolean(raw.optical_expansion),
            timestamp: raw.timestamp || new Date().toLocaleTimeString(),
          };

          setAlerts((prev) => [newAlert, ...prev.slice(0, 5)]);

          if (newAlert.threat_level === "CRITICAL" || newAlert.geofence_breach) {
            setBreachCount((prev) => prev + 1);
            playTacticalAlarm(true);
          } else {
            playTacticalAlarm(false);
          }
        } catch (err) {
          console.error("Malformed telemetry packet", err);
        }
      };

      ws.onerror = () => {
        if (unmounted) return;
        setConnectionStatus("OFFLINE");
      };

      ws.onclose = () => {
        if (unmounted) return;
        setConnectionStatus("OFFLINE");
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    return () => {
      unmounted = true;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [playTacticalAlarm]);

  // Mock SOS Dispatch Trigger
  const handleTriggerSOS = async () => {
    setIsSOSActive(true);
    playTacticalAlarm(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "MOCK_SOS", cam_id: activeCamId }));
    } else {
      try {
        await fetch(`http://127.0.0.1:8000/api/mock_sos?cam_id=${activeCamId}`, { method: "POST" });
      } catch (err) {
        const activeCam = cameras.find((c) => c.id === activeCamId) || cameras[0];
        const localSOS: ThreatAlert = {
          id: `sos-${Date.now()}`,
          cam_id: activeCamId,
          sector: activeCam.name,
          threat: "MANUAL_SOS_DISPATCH_TRIGGERED",
          confidence: 99.9,
          threat_level: "CRITICAL",
          geofence_breach: true,
          optical_expansion: true,
          timestamp: new Date().toLocaleTimeString(),
        };
        setAlerts((prev) => [localSOS, ...prev.slice(0, 5)]);
        setBreachCount((prev) => prev + 1);
      }
    }

    setTimeout(() => setIsSOSActive(false), 2500);
  };

  const activeCameraObj = cameras.find((c) => c.id === activeCamId) || cameras[0];

  return (
    <div style={styles.container}>
      {/* ================= TOP TACTICAL COMMAND BAR ================= */}
      <header style={styles.header}>
        <div style={styles.brandGroup}>
          <div style={styles.radarIconBox}>
            <Crosshair size={22} color="#00f59b" />
          </div>
          <div>
            <div style={styles.titleRow}>
              <span style={styles.systemBadge}>PS ID: SIH26187</span>
              <h1 style={styles.mainTitle}>SENTRY-AI: Tactical Border Multi-Sector Command</h1>
              
              {/* Blinking REC Indicator */}
              <div style={styles.recBadge}>
                <span style={styles.recDot} />
                <span style={styles.recText}>REC</span>
              </div>
            </div>
            <p style={styles.subTitle}>
              Autonomous Multi-Camera Edge AI Perimeter Defense & Zero-Line Geofencing Engine
            </p>
          </div>
        </div>

        <div style={styles.headerActions}>
          {/* Radio Status Badge */}
          <div
            style={{
              ...styles.statusBadge,
              borderColor: connectionStatus === "ONLINE / SECURE" ? "#00f59b" : "#ef4444",
              background: connectionStatus === "ONLINE / SECURE" ? "rgba(0,245,155,0.08)" : "rgba(239,68,68,0.08)",
            }}
          >
            {connectionStatus === "ONLINE / SECURE" ? (
              <Wifi size={16} color="#00f59b" />
            ) : (
              <WifiOff size={16} color="#ef4444" />
            )}
            <span
              style={{
                ...styles.statusDot,
                backgroundColor: connectionStatus === "ONLINE / SECURE" ? "#00f59b" : "#ef4444",
              }}
            />
            <span
              style={{
                color: connectionStatus === "ONLINE / SECURE" ? "#00f59b" : "#ef4444",
                fontWeight: 700,
                fontSize: "0.78rem",
                letterSpacing: "0.06em",
              }}
            >
              {connectionStatus}
            </span>
          </div>

          {/* Audio Mute Toggle */}
          <button
            onClick={() => setAudioMuted(!audioMuted)}
            style={styles.iconButton}
            title={audioMuted ? "Unmute Tactical Siren" : "Mute Siren"}
          >
            {audioMuted ? <VolumeX size={18} color="#94a3b8" /> : <Volume2 size={18} color="#00f59b" />}
          </button>

          {/* Mock SOS Dispatch Button */}
          <button
            onClick={handleTriggerSOS}
            style={{
              ...styles.sosButton,
              backgroundColor: isSOSActive ? "#dc2626" : "#b91c1c",
              boxShadow: isSOSActive
                ? "0 0 25px rgba(220, 38, 38, 0.85)"
                : "0 0 12px rgba(185, 28, 28, 0.4)",
            }}
          >
            <ShieldAlert size={18} color="#ffffff" />
            <span>TRIGGER MOCK SOS DISPATCH</span>
          </button>
        </div>
      </header>

      {/* ================= 3 KEY METRIC CARDS ================= */}
      <section style={styles.hudGrid}>
        {/* Card 1: Active Surveillance Streams */}
        <div style={styles.hudCard}>
          <div style={styles.hudCardHeader}>
            <div style={styles.hudLabel}>
              <Video size={16} color="#00f59b" />
              <span>ACTIVE SURVEILLANCE STREAMS</span>
            </div>
            <span style={styles.hudTagLive}>ONLINE: {cameras.length} NODES</span>
          </div>
          <div style={styles.hudCardBody}>
            <div style={styles.hudValue}>
              {String(cameras.length).padStart(2, "0")}{" "}
              <span style={styles.hudSubUnit}>/ {cameras.length} ARMED CHANNELS</span>
            </div>
            <div style={styles.sectorChips}>
              {cameras.map((c) => (
                <span
                  key={c.id}
                  onClick={() => {
                    setActiveCamId(c.id);
                    setImgError(false);
                  }}
                  style={{
                    ...styles.sectorChipActive,
                    borderColor: activeCamId === c.id ? "#00f59b" : "#334155",
                    backgroundColor: activeCamId === c.id ? "rgba(0, 245, 155, 0.18)" : "#1e293b",
                    color: activeCamId === c.id ? "#00f59b" : "#94a3b8",
                  }}
                >
                  Cam {parseInt(c.id, 10) + 1}: {c.id === "0" ? "Sector A" : "Sector B"}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Zero-Line Breaches */}
        <div
          style={{
            ...styles.hudCard,
            borderLeft: breachCount > 0 ? "3px solid #ef4444" : "1px solid #1f293d",
          }}
        >
          <div style={styles.hudCardHeader}>
            <div style={styles.hudLabel}>
              <AlertTriangle size={16} color={breachCount > 0 ? "#ef4444" : "#f59e0b"} />
              <span>ZERO-LINE BREACHES</span>
            </div>
            <span
              style={{
                ...styles.hudTagLive,
                backgroundColor: breachCount > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                color: breachCount > 0 ? "#ef4444" : "#f59e0b",
                borderColor: breachCount > 0 ? "rgba(239, 68, 68, 0.4)" : "rgba(245, 158, 11, 0.4)",
              }}
            >
              {breachCount > 0 ? "INTRUSION DETECTED" : "SECTOR SECURE"}
            </span>
          </div>
          <div style={styles.hudCardBody}>
            <div
              style={{
                ...styles.hudValue,
                color: breachCount > 0 ? "#ef4444" : "#f8fafc",
              }}
            >
              {String(breachCount).padStart(2, "0")}{" "}
              <span style={styles.hudSubUnit}>INCIDENTS LOGGED</span>
            </div>
            <p style={styles.hudCaption}>
              Optical expansion + Geofence polygon boundary crossing
            </p>
          </div>
        </div>

        {/* Card 3: Bandwidth Optimization Mode */}
        <div style={styles.hudCard}>
          <div style={styles.hudCardHeader}>
            <div style={styles.hudLabel}>
              <Zap size={16} color="#38bdf8" />
              <span>BANDWIDTH OPTIMIZATION</span>
            </div>
            <span
              style={{
                ...styles.hudTagLive,
                backgroundColor: "rgba(56, 189, 248, 0.12)",
                color: "#38bdf8",
                borderColor: "rgba(56, 189, 248, 0.3)",
              }}
            >
              EDGE AI PIPELINE
            </span>
          </div>
          <div style={styles.hudCardBody}>
            <div style={{ ...styles.hudValue, color: "#38bdf8" }}>
              98% <span style={styles.hudSubUnit}>BANDWIDTH SAVED</span>
            </div>
            <p style={styles.hudCaption}>
              Metadata Stream Only — Ultra-Low Latency Border Uplink
            </p>
          </div>
        </div>
      </section>

      {/* ================= DUAL-PANEL TACTICAL GRID ================= */}
      <main style={styles.mainGrid}>
        {/* Left Panel: High-Definition Video Viewport & Multi-Cam Switcher */}
        <div style={styles.feedPanel}>
          {/* Multi-Camera Sector Switcher Tab Bar */}
          <div style={styles.sectorTabBar}>
            <div style={styles.tabBarLabel}>
              <Layers size={15} color="#00f59b" />
              <span>SECTOR CHANNELS:</span>
            </div>
            <div style={styles.camTabs}>
              <button
                onClick={() => {
                  setActiveCamId("0");
                  setImgError(false);
                }}
                style={{
                  ...styles.sectorTabBtn,
                  backgroundColor: activeCamId === "0" ? "#00f59b" : "transparent",
                  color: activeCamId === "0" ? "#0a0f1d" : "#cbd5e1",
                  borderColor: activeCamId === "0" ? "#00f59b" : "#334155",
                }}
              >
                <Eye size={14} />
                <span>Cam 01: Sector A (Command Post Webcam)</span>
              </button>

              <button
                onClick={() => {
                  setActiveCamId("1");
                  setImgError(false);
                }}
                style={{
                  ...styles.sectorTabBtn,
                  backgroundColor: activeCamId === "1" ? "#00f59b" : "transparent",
                  color: activeCamId === "1" ? "#0a0f1d" : "#cbd5e1",
                  borderColor: activeCamId === "1" ? "#00f59b" : "#334155",
                }}
              >
                <Radio size={14} />
                <span>Cam 02: Sector B (Perimeter Buffer Node)</span>
              </button>
            </div>
          </div>

          <div style={styles.feedHeader}>
            <div style={styles.feedTitleGroup}>
              <Eye size={17} color="#00f59b" />
              <span style={styles.feedTitle}>
                {activeCameraObj ? activeCameraObj.name.toUpperCase() : `CAM-${activeCamId}`}
              </span>
              <span style={styles.claheTag}>CLAHE NIGHT-VISION: ACTIVE</span>
            </div>
            <div style={styles.coordinatesText}>
              {activeCameraObj ? activeCameraObj.coordinates : "LAT 34.0836° N / LON 74.7973° E"}
            </div>
          </div>

          <div style={styles.videoContainer}>
            {/* Live MJPEG stream dynamically requesting activeCamId */}
            {!imgError ? (
              <img
                src={`http://127.0.0.1:8000/video_feed/${activeCamId}`}
                alt={`Surveillance Feed ${activeCamId}`}
                style={styles.videoStream}
                onError={() => setImgError(true)}
              />
            ) : (
              <div style={styles.fallbackScreen}>
                <Radio size={40} color="#00f59b" style={{ animation: "pulse 2s infinite" }} />
                <p style={styles.fallbackTitle}>CONNECTING TO SENSOR NODE CAM-{activeCamId}...</p>
                <p style={styles.fallbackText}>
                  Endpoint: <code>/video_feed/{activeCamId}</code> ({activeCameraObj?.name})
                </p>
                <button
                  onClick={() => setImgError(false)}
                  style={styles.retryBtn}
                >
                  <RefreshCw size={14} />
                  <span>Reconnect Camera Feed</span>
                </button>
              </div>
            )}

            {/* Tactical HUD Badges & Overlays */}
            <div style={styles.feedOverlayTopLeft}>
              <span style={styles.tacticalBadge}>
                {activeCameraObj ? activeCameraObj.coordinates : "LAT 34.0836° N"}
              </span>
              <span style={styles.tacticalBadge}>ELEV: 2,420M | HUMID: 88%</span>
            </div>

            <div style={styles.feedOverlayTopRight}>
              <span style={styles.tacticalBadgeGreen}>YOLOv8 GEOFENCING: ARMED</span>
            </div>

            <div style={styles.feedOverlayBottom}>
              <span style={styles.geofenceNotice}>
                [--- VIRTUAL ZERO-LINE GEOFENCE BOUNDARY AT Y=60% ---]
              </span>
            </div>
          </div>

          {/* Video Footer Telemetry Bar */}
          <div style={styles.feedFooter}>
            <div style={styles.feedFooterItem}>
              <Activity size={14} color="#00f59b" />
              <span>LIVE FPS: {fpsVal}</span>
            </div>
            <div style={styles.feedFooterItem}>
              <Server size={14} color="#38bdf8" />
              <span>INFERENCE: 14.2ms</span>
            </div>
            <div style={styles.feedFooterItem}>
              <Layers size={14} color="#f59e0b" />
              <span>ZERO-LINE GEOFENCE: ACTIVE</span>
            </div>
            <div style={styles.feedFooterItem}>
              <Compass size={14} color="#94a3b8" />
              <span>BEARING: 042° NE</span>
            </div>
          </div>
        </div>

        {/* Right Panel: Threat Incident Telemetry Log */}
        <div style={styles.incidentPanel}>
          <div style={styles.incidentHeader}>
            <div style={styles.incidentTitleGroup}>
              <ShieldAlert size={18} color="#ef4444" />
              <span style={styles.incidentTitle}>THREAT INCIDENT TELEMETRY LOG</span>
            </div>
            <span style={styles.alertCountBadge}>
              {alerts.length} LATEST ALERTS
            </span>
          </div>

          <div style={styles.alertList}>
            {alerts.map((alert) => {
              const isCrit = alert.threat_level === "CRITICAL" || alert.geofence_breach;
              return (
                <div
                  key={alert.id}
                  style={{
                    ...styles.alertCard,
                    borderColor: isCrit ? "#ef4444" : "#f59e0b",
                    backgroundColor: isCrit ? "rgba(239, 68, 68, 0.08)" : "rgba(245, 158, 11, 0.05)",
                  }}
                >
                  <div style={styles.alertCardTop}>
                    <div style={styles.alertThreatTag}>
                      <span
                        style={{
                          ...styles.threatLevelBadge,
                          backgroundColor: isCrit ? "#ef4444" : "#f59e0b",
                        }}
                      >
                        {alert.threat_level}
                      </span>
                      <span style={styles.threatName}>{alert.threat}</span>
                    </div>
                    <span style={styles.alertTime}>
                      <Clock size={12} style={{ marginRight: "3px", verticalAlign: "middle" }} />
                      {alert.timestamp}
                    </span>
                  </div>

                  <div style={styles.alertCardDetails}>
                    <div style={styles.alertDetailRow}>
                      <span style={styles.alertDetailKey}>Sector Channel:</span>
                      <span style={styles.alertDetailVal}>{alert.sector}</span>
                    </div>

                    <div style={styles.alertDetailRow}>
                      <span style={styles.alertDetailKey}>AI Confidence:</span>
                      <span style={styles.alertDetailValConfidence}>
                        {alert.confidence.toFixed(1)}%
                      </span>
                    </div>

                    {alert.geofence_breach && (
                      <div style={styles.breachWarningTag}>
                        <Flame size={13} color="#ef4444" />
                        <span>ZERO-LINE GEOFENCE BREACH VERIFIED</span>
                      </div>
                    )}

                    {alert.optical_expansion && (
                      <div style={styles.expansionWarningTag}>
                        <Activity size={13} color="#f59e0b" />
                        <span>RAPID OPTICAL EXPANSION (ADVANCING TARGET)</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Incident Stream Footer & Quick Actions */}
          <div style={styles.incidentFooter}>
            <div style={styles.incidentFooterInfo}>
              <Terminal size={14} color="#64748b" />
              <span>WebSocket Real-Time Broadcast Tagged by Cam ID</span>
            </div>
            <button
              onClick={() =>
                setAlerts([
                  {
                    id: `manual-${Date.now()}`,
                    cam_id: activeCamId,
                    sector: activeCameraObj ? activeCameraObj.name : `Sector ${activeCamId}`,
                    threat: "TARGET_ACKNOWLEDGED_CLEARED",
                    confidence: 100.0,
                    threat_level: "MONITORING",
                    geofence_breach: false,
                    timestamp: new Date().toLocaleTimeString(),
                  },
                  ...alerts.slice(0, 5),
                ])
              }
              style={styles.ackBtn}
            >
              <CheckCircle2 size={13} />
              <span>Acknowledge</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// =============================================================================
// DARK MILITARY TACTICAL STYLES (#0a0f1d / #111827)
// =============================================================================
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0a0f1d",
    color: "#f8fafc",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111827",
    padding: "14px 20px",
    borderRadius: "10px",
    border: "1px solid #1e293b",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
    flexWrap: "wrap",
    gap: "12px",
  },
  brandGroup: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  radarIconBox: {
    width: "42px",
    height: "42px",
    borderRadius: "8px",
    backgroundColor: "rgba(0, 245, 155, 0.1)",
    border: "1px solid rgba(0, 245, 155, 0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  systemBadge: {
    fontSize: "0.68rem",
    backgroundColor: "#00f59b",
    color: "#0a0f1d",
    fontWeight: 800,
    padding: "2px 7px",
    borderRadius: "4px",
    letterSpacing: "0.08em",
  },
  mainTitle: {
    fontSize: "1.22rem",
    fontWeight: 800,
    letterSpacing: "0.04em",
    margin: 0,
    color: "#f8fafc",
    textTransform: "uppercase",
  },
  recBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  recDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    backgroundColor: "#ef4444",
    boxShadow: "0 0 8px #ef4444",
  },
  recText: {
    color: "#ef4444",
    fontSize: "0.68rem",
    fontWeight: 800,
    letterSpacing: "0.08em",
  },
  subTitle: {
    fontSize: "0.78rem",
    color: "#94a3b8",
    margin: "3px 0 0 0",
    letterSpacing: "0.02em",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 14px",
    borderRadius: "6px",
    border: "1px solid",
  },
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    boxShadow: "0 0 8px currentColor",
  },
  iconButton: {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#f8fafc",
    padding: "8px 10px",
    borderRadius: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  sosButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#ffffff",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    fontWeight: 700,
    fontSize: "0.82rem",
    letterSpacing: "0.05em",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  hudGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "14px",
  },
  hudCard: {
    backgroundColor: "#111827",
    borderRadius: "8px",
    padding: "14px 18px",
    border: "1px solid #1f293d",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
  },
  hudCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hudLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "0.78rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "#94a3b8",
  },
  hudTagLive: {
    fontSize: "0.68rem",
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: "4px",
    backgroundColor: "rgba(0, 245, 155, 0.12)",
    color: "#00f59b",
    border: "1px solid rgba(0, 245, 155, 0.3)",
    letterSpacing: "0.04em",
  },
  hudCardBody: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  hudValue: {
    fontSize: "1.75rem",
    fontWeight: 800,
    letterSpacing: "0.03em",
    color: "#f8fafc",
  },
  hudSubUnit: {
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "#64748b",
  },
  sectorChips: {
    display: "flex",
    gap: "6px",
    marginTop: "6px",
    flexWrap: "wrap",
  },
  sectorChipActive: {
    fontSize: "0.68rem",
    padding: "2px 8px",
    borderRadius: "4px",
    border: "1px solid",
    fontWeight: 600,
    cursor: "pointer",
  },
  hudCaption: {
    fontSize: "0.75rem",
    color: "#64748b",
    margin: "4px 0 0 0",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1.35fr 1fr",
    gap: "16px",
    flex: 1,
  },
  feedPanel: {
    backgroundColor: "#111827",
    borderRadius: "10px",
    border: "1px solid #1e293b",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
  },
  sectorTabBar: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 16px",
    backgroundColor: "#080d19",
    borderBottom: "1px solid #1e293b",
    flexWrap: "wrap",
  },
  tabBarLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.72rem",
    fontWeight: 800,
    color: "#94a3b8",
    letterSpacing: "0.06em",
  },
  camTabs: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  sectorTabBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    border: "1px solid",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "0.76rem",
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  feedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
    backgroundColor: "#0d1322",
    borderBottom: "1px solid #1e293b",
  },
  feedTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  feedTitle: {
    fontSize: "0.85rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "#f8fafc",
  },
  claheTag: {
    fontSize: "0.68rem",
    fontWeight: 700,
    backgroundColor: "rgba(0, 245, 155, 0.15)",
    color: "#00f59b",
    padding: "2px 8px",
    borderRadius: "4px",
    border: "1px solid rgba(0, 245, 155, 0.3)",
  },
  coordinatesText: {
    fontSize: "0.72rem",
    color: "#94a3b8",
    fontFamily: "monospace",
  },
  videoContainer: {
    position: "relative",
    flex: 1,
    minHeight: "420px",
    backgroundColor: "#050811",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  videoStream: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  fallbackScreen: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "30px",
    textAlign: "center",
    gap: "10px",
  },
  fallbackTitle: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#00f59b",
    letterSpacing: "0.05em",
    margin: 0,
  },
  fallbackText: {
    fontSize: "0.8rem",
    color: "#94a3b8",
    margin: 0,
  },
  retryBtn: {
    marginTop: "8px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "#1e293b",
    color: "#00f59b",
    border: "1px solid #00f59b",
    padding: "6px 14px",
    borderRadius: "6px",
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  feedOverlayTopLeft: {
    position: "absolute",
    top: "12px",
    left: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  feedOverlayTopRight: {
    position: "absolute",
    top: "12px",
    right: "12px",
  },
  feedOverlayBottom: {
    position: "absolute",
    bottom: "10px",
    left: 0,
    right: 0,
    textAlign: "center",
  },
  tacticalBadge: {
    backgroundColor: "rgba(10, 15, 29, 0.8)",
    color: "#94a3b8",
    fontSize: "0.68rem",
    padding: "2px 8px",
    borderRadius: "4px",
    border: "1px solid #334155",
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
  tacticalBadgeGreen: {
    backgroundColor: "rgba(0, 245, 155, 0.15)",
    color: "#00f59b",
    fontSize: "0.68rem",
    padding: "2px 8px",
    borderRadius: "4px",
    border: "1px solid rgba(0, 245, 155, 0.4)",
    fontWeight: 700,
    letterSpacing: "0.04em",
  },
  geofenceNotice: {
    backgroundColor: "rgba(10, 15, 29, 0.85)",
    color: "#f59e0b",
    fontSize: "0.68rem",
    fontWeight: 700,
    padding: "3px 12px",
    borderRadius: "4px",
    letterSpacing: "0.08em",
  },
  feedFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 16px",
    backgroundColor: "#0d1322",
    borderTop: "1px solid #1e293b",
    flexWrap: "wrap",
    gap: "10px",
  },
  feedFooterItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.75rem",
    color: "#94a3b8",
    fontWeight: 600,
  },
  incidentPanel: {
    backgroundColor: "#111827",
    borderRadius: "10px",
    border: "1px solid #1e293b",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
  },
  incidentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "#0d1322",
    borderBottom: "1px solid #1e293b",
  },
  incidentTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  incidentTitle: {
    fontSize: "0.85rem",
    fontWeight: 800,
    letterSpacing: "0.06em",
    color: "#f8fafc",
  },
  alertCountBadge: {
    fontSize: "0.7rem",
    fontWeight: 700,
    backgroundColor: "#1e293b",
    color: "#94a3b8",
    padding: "3px 8px",
    borderRadius: "4px",
    border: "1px solid #334155",
  },
  alertList: {
    flex: 1,
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    overflowY: "auto",
    maxHeight: "480px",
  },
  alertCard: {
    borderRadius: "8px",
    border: "1px solid",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  alertCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  alertThreatTag: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  threatLevelBadge: {
    color: "#0a0f1d",
    fontSize: "0.68rem",
    fontWeight: 900,
    padding: "2px 6px",
    borderRadius: "3px",
    letterSpacing: "0.06em",
  },
  threatName: {
    fontSize: "0.85rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "#f8fafc",
  },
  alertTime: {
    fontSize: "0.72rem",
    color: "#64748b",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
  },
  alertCardDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  alertDetailRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.78rem",
  },
  alertDetailKey: {
    color: "#94a3b8",
  },
  alertDetailVal: {
    color: "#e2e8f0",
    fontWeight: 600,
  },
  alertDetailValConfidence: {
    color: "#00f59b",
    fontWeight: 700,
  },
  breachWarningTag: {
    marginTop: "4px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    color: "#ef4444",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "0.72rem",
    fontWeight: 700,
    border: "1px solid rgba(239, 68, 68, 0.4)",
  },
  expansionWarningTag: {
    marginTop: "2px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    color: "#f59e0b",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "0.72rem",
    fontWeight: 700,
    border: "1px solid rgba(245, 158, 11, 0.3)",
  },
  incidentFooter: {
    padding: "10px 14px",
    backgroundColor: "#0d1322",
    borderTop: "1px solid #1e293b",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
  },
  incidentFooterInfo: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.72rem",
    color: "#64748b",
  },
  ackBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    color: "#f8fafc",
    padding: "5px 10px",
    borderRadius: "4px",
    fontSize: "0.72rem",
    fontWeight: 600,
    cursor: "pointer",
  },
};