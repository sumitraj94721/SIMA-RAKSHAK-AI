import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Moon,
  Sun,
  Sparkles,
  Camera,
  X,
  Maximize2,
  Cpu,
  HardDrive,
  ShieldCheck,
} from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================
export interface ThreatAlert {
  id: string;
  cam_id?: string;
  sector: string;
  threat: string;
  object?: string;
  track_id?: number;
  confidence: number;
  threat_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | "WARNING" | "MONITORING";
  event?: string;
  direction?: string;
  zone?: string;
  geofence_breach: boolean;
  optical_expansion?: boolean;
  coordinates?: string;
  evidence_snapshot?: string;
  timestamp: string;
}

export interface CameraTelemetry {
  id: string;
  name: string;
  coordinates: string;
  type: string;
  status: "ONLINE" | "RECONNECTING" | "DEGRADED" | "OFFLINE" | "INITIALIZING" | "CONNECTING";
  source?: string;
  capture_fps: number;
  inference_fps: number;
  latency_ms: number;
  resolution: string;
  active_tracks: number;
  breach_count: number;
  night_vision_mode: string;
  zero_line_ratio?: number;
  last_frame_time?: number;
}

export interface SystemTelemetry {
  status: string;
  uptime_seconds: number;
  cameras_total: number;
  cameras_online: number;
  active_tracks: number;
  total_breaches: number;
  avg_inference_fps: number;
  avg_latency_ms: number;
  cpu_usage_pct: number;
  memory_usage_pct: number;
  timestamp: string;
}

export type ConnectionStatus = "CONNECTING" | "ONLINE / SECURE" | "OFFLINE" | "RECONNECTING";

const API_BASE = "http://127.0.0.1:8000";
const WS_BASE = "ws://127.0.0.1:8000";

export default function App() {
  // Cameras telemetry registry
  const [cameras, setCameras] = useState<CameraTelemetry[]>([
    {
      id: "0",
      name: "Sector A (Command Post Webcam)",
      coordinates: "LAT 34.0836° N / LON 74.7973° E",
      type: "OPTICAL_SURVEILLANCE",
      status: "ONLINE",
      capture_fps: 28.0,
      inference_fps: 14.5,
      latency_ms: 15.2,
      resolution: "640x480",
      active_tracks: 0,
      breach_count: 0,
      night_vision_mode: "AUTO",
    },
    {
      id: "1",
      name: "Sector B (Perimeter Buffer Node)",
      coordinates: "LAT 34.0912° N / LON 74.8021° E",
      type: "BUFFER_ZONE_IR",
      status: "ONLINE",
      capture_fps: 24.0,
      inference_fps: 13.8,
      latency_ms: 18.0,
      resolution: "640x480",
      active_tracks: 0,
      breach_count: 0,
      night_vision_mode: "AUTO",
    },
  ]);

  const [activeCamId, setActiveCamId] = useState<string>("0");
  const [alerts, setAlerts] = useState<ThreatAlert[]>([
    {
      id: "init-001",
      cam_id: "0",
      sector: "Sector A (Command Post Webcam)",
      threat: "SYSTEM_INITIALIZED",
      object: "radar",
      confidence: 100.0,
      threat_level: "INFO",
      event: "PERIMETER_MONITOR_ONLINE",
      geofence_breach: false,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const [systemTelemetry, setSystemTelemetry] = useState<SystemTelemetry>({
    status: "healthy",
    uptime_seconds: 0,
    cameras_total: 2,
    cameras_online: 2,
    active_tracks: 0,
    total_breaches: 0,
    avg_inference_fps: 14.5,
    avg_latency_ms: 16.0,
    cpu_usage_pct: 18.4,
    memory_usage_pct: 42.1,
    timestamp: "",
  });

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("CONNECTING");
  const [breachCount, setBreachCount] = useState<number>(0);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [isSOSActive, setIsSOSActive] = useState<boolean>(false);
  const [imgError, setImgError] = useState<boolean>(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<ThreatAlert | null>(null);
  const [nightVisionChanging, setNightVisionChanging] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const backoffRef = useRef<number>(1000);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Active Camera Object
  const activeCameraObj = useMemo(() => {
    return cameras.find((c) => c.id === activeCamId) || cameras[0];
  }, [cameras, activeCamId]);

  // Format uptime
  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

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
        osc.frequency.exponentialRampToValueAtTime(isCritical ? 440 : 720, ctx.currentTime + 0.28);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.32);
      } catch (err) {
        // Fallback or audio permission restrictions
      }
    },
    [audioMuted]
  );

  // Polling Telemetry Fallback (ensures live telemetry even without active WS)
  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/system/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.system) {
          setSystemTelemetry(data.system);
          setBreachCount(data.system.total_breaches || 0);
        }
        if (Array.isArray(data.cameras) && data.cameras.length > 0) {
          setCameras(data.cameras);
        }
      }
    } catch {
      // Retain previous state
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  // Resilient WebSocket Connection with Exponential Backoff
  useEffect(() => {
    let unmounted = false;

    const connectWebSocket = () => {
      if (unmounted) return;
      const wsUrl = `${WS_BASE}/ws/alerts`;
      setConnectionStatus("CONNECTING");

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setConnectionStatus("ONLINE / SECURE");
        backoffRef.current = 1000; // Reset backoff on success
      };

      ws.onmessage = (event) => {
        if (unmounted) return;
        try {
          const packet = JSON.parse(event.data);

          // Handle System Heartbeat Packet
          if (packet.event === "SYSTEM_HEARTBEAT") {
            if (packet.telemetry) {
              setSystemTelemetry(packet.telemetry);
              setBreachCount(packet.telemetry.total_breaches || 0);
            }
            if (Array.isArray(packet.cameras)) {
              setCameras(packet.cameras);
            }
            return;
          }

          // Handle Handshake
          if (packet.event === "HANDSHAKE_ESTABLISHED") {
            if (packet.telemetry) setSystemTelemetry(packet.telemetry);
            if (Array.isArray(packet.cameras)) setCameras(packet.cameras);
            return;
          }

          // Handle Threat Alert Event
          const newAlert: ThreatAlert = {
            id: packet.id || `alert-${Date.now()}`,
            cam_id: packet.cam_id || "0",
            sector: packet.sector || `Sector ${packet.cam_id || "A"}`,
            threat: packet.threat || "INTRUDER_DETECTED",
            object: packet.object || "target",
            track_id: packet.track_id,
            confidence: typeof packet.confidence === "number" ? packet.confidence : 95.0,
            threat_level: packet.threat_level || (packet.geofence_breach ? "CRITICAL" : "HIGH"),
            event: packet.event || (packet.geofence_breach ? "ZERO_LINE_BREACH" : "TARGET_DETECTED"),
            direction: packet.direction,
            zone: packet.zone,
            geofence_breach: Boolean(packet.geofence_breach),
            optical_expansion: Boolean(packet.optical_expansion),
            evidence_snapshot: packet.evidence_snapshot,
            coordinates: packet.coordinates,
            timestamp: packet.timestamp || new Date().toLocaleTimeString(),
          };

          setAlerts((prev) => [newAlert, ...prev.slice(0, 9)]);

          if (newAlert.threat_level === "CRITICAL" || newAlert.geofence_breach) {
            setBreachCount((prev) => prev + 1);
            playTacticalAlarm(true);
          } else if (newAlert.threat_level === "HIGH" || newAlert.threat_level === "WARNING") {
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
        setConnectionStatus("RECONNECTING");
        const delay = backoffRef.current;
        backoffRef.current = Math.min(30000, backoffRef.current * 2);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
      };
    };

    connectWebSocket();

    return () => {
      unmounted = true;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [playTacticalAlarm]);

  // Night Vision Mode Toggle
  const handleSetNightVision = async (mode: "NORMAL" | "NIGHT_VISION" | "AUTO") => {
    setNightVisionChanging(true);
    try {
      await fetch(`${API_BASE}/api/cameras/${activeCamId}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ night_vision_mode: mode }),
      });
      setCameras((prev) =>
        prev.map((c) => (c.id === activeCamId ? { ...c, night_vision_mode: mode } : c))
      );
    } catch {
      // Local fallback
    } finally {
      setTimeout(() => setNightVisionChanging(false), 300);
    }
  };

  // Mock SOS Dispatch Trigger
  const handleTriggerSOS = async () => {
    setIsSOSActive(true);
    playTacticalAlarm(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "MOCK_SOS", cam_id: activeCamId }));
    } else {
      try {
        await fetch(`${API_BASE}/api/mock_sos?cam_id=${activeCamId}`, { method: "POST" });
      } catch {
        const localSOS: ThreatAlert = {
          id: `sos-${Date.now()}`,
          cam_id: activeCamId,
          sector: activeCameraObj.name,
          threat: "MANUAL_SOS_DISPATCH_TRIGGERED",
          object: "person",
          track_id: 99,
          confidence: 99.9,
          threat_level: "CRITICAL",
          event: "ZERO_LINE_BREACH",
          geofence_breach: true,
          optical_expansion: true,
          timestamp: new Date().toLocaleTimeString(),
        };
        setAlerts((prev) => [localSOS, ...prev.slice(0, 9)]);
        setBreachCount((prev) => prev + 1);
      }
    }

    setTimeout(() => setIsSOSActive(false), 2000);
  };

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
              <h1 style={styles.mainTitle}>SENTRY-AI: Tactical Border Surveillance Command</h1>

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

        {/* Real-time System Metrics Header Pill Strip */}
        <div style={styles.headerTelemetryStrip}>
          <div style={styles.telemetryPill}>
            <Cpu size={14} color="#38bdf8" />
            <span>CPU: {systemTelemetry.cpu_usage_pct.toFixed(1)}%</span>
          </div>
          <div style={styles.telemetryPill}>
            <HardDrive size={14} color="#a78bfa" />
            <span>RAM: {systemTelemetry.memory_usage_pct.toFixed(1)}%</span>
          </div>
          <div style={styles.telemetryPill}>
            <Clock size={14} color="#f59e0b" />
            <span>UPTIME: {formatUptime(systemTelemetry.uptime_seconds)}</span>
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
            <span style={styles.hudTagLive}>
              ONLINE: {systemTelemetry.cameras_online}/{cameras.length} NODES
            </span>
          </div>
          <div style={styles.hudCardBody}>
            <div style={styles.hudValue}>
              {String(systemTelemetry.cameras_online).padStart(2, "0")}{" "}
              <span style={styles.hudSubUnit}>/ {cameras.length} ARMED CHANNELS</span>
            </div>
            <div style={styles.sectorChips}>
              {cameras.map((c) => {
                const isOnline = c.status === "ONLINE";
                const isRec = c.status === "RECONNECTING" || c.status === "CONNECTING";
                const dotColor = isOnline ? "#00f59b" : isRec ? "#f59e0b" : "#ef4444";
                return (
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
                    <span style={{ ...styles.inlineDot, backgroundColor: dotColor }} />
                    {c.id === "0" ? "Sector A (Webcam)" : "Sector B (Node)"} [{c.status}]
                  </span>
                );
              })}
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
              {breachCount > 0 ? "INTRUSION LOGGED" : "SECTOR SECURE"}
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
              <span style={styles.hudSubUnit}>BREACH EVENTS RECORDED</span>
            </div>
            <p style={styles.hudCaption}>
              Persistent Track Centroid Crossing + Optical Expansion Vector
            </p>
          </div>
        </div>

        {/* Card 3: AI Inference & Pipeline Engine */}
        <div style={styles.hudCard}>
          <div style={styles.hudCardHeader}>
            <div style={styles.hudLabel}>
              <Zap size={16} color="#38bdf8" />
              <span>AI INFERENCE & ENGINE</span>
            </div>
            <span
              style={{
                ...styles.hudTagLive,
                backgroundColor: "rgba(56, 189, 248, 0.12)",
                color: "#38bdf8",
                borderColor: "rgba(56, 189, 248, 0.3)",
              }}
            >
              YOLOv8 + CLAHE
            </span>
          </div>
          <div style={styles.hudCardBody}>
            <div style={{ ...styles.hudValue, color: "#38bdf8" }}>
              {activeCameraObj.inference_fps.toFixed(1)}{" "}
              <span style={styles.hudSubUnit}>FPS INFERENCE ({activeCameraObj.latency_ms.toFixed(1)}ms)</span>
            </div>
            <p style={styles.hudCaption}>
              Bounded Buffer Single-Slot Frame Pipeline — Zero Accumulation
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
              {cameras.map((c) => {
                const isActive = activeCamId === c.id;
                const isOnline = c.status === "ONLINE";
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveCamId(c.id);
                      setImgError(false);
                    }}
                    style={{
                      ...styles.sectorTabBtn,
                      backgroundColor: isActive ? "#00f59b" : "#111827",
                      color: isActive ? "#0a0f1d" : "#cbd5e1",
                      borderColor: isActive ? "#00f59b" : "#334155",
                    }}
                  >
                    {c.id === "0" ? <Eye size={14} /> : <Radio size={14} />}
                    <span>{c.name}</span>
                    <span
                      style={{
                        ...styles.statusDotSmall,
                        backgroundColor: isOnline ? (isActive ? "#0a0f1d" : "#00f59b") : "#ef4444",
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feed Header with Night Vision Switcher */}
          <div style={styles.feedHeader}>
            <div style={styles.feedTitleGroup}>
              <Eye size={17} color="#00f59b" />
              <span style={styles.feedTitle}>
                {activeCameraObj.name.toUpperCase()}
              </span>
              <span style={styles.resTag}>{activeCameraObj.resolution}</span>
            </div>

            {/* Night Vision Mode Selector */}
            <div style={styles.nightVisionControls}>
              <span style={styles.nvLabel}>NIGHT VISION:</span>
              <button
                onClick={() => handleSetNightVision("AUTO")}
                disabled={nightVisionChanging}
                style={{
                  ...styles.nvBtn,
                  backgroundColor: activeCameraObj.night_vision_mode === "AUTO" ? "#00f59b" : "#1e293b",
                  color: activeCameraObj.night_vision_mode === "AUTO" ? "#0a0f1d" : "#94a3b8",
                }}
              >
                <Sparkles size={12} />
                <span>AUTO</span>
              </button>
              <button
                onClick={() => handleSetNightVision("NIGHT_VISION")}
                disabled={nightVisionChanging}
                style={{
                  ...styles.nvBtn,
                  backgroundColor: activeCameraObj.night_vision_mode === "NIGHT_VISION" ? "#00f59b" : "#1e293b",
                  color: activeCameraObj.night_vision_mode === "NIGHT_VISION" ? "#0a0f1d" : "#94a3b8",
                }}
              >
                <Moon size={12} />
                <span>CLAHE</span>
              </button>
              <button
                onClick={() => handleSetNightVision("NORMAL")}
                disabled={nightVisionChanging}
                style={{
                  ...styles.nvBtn,
                  backgroundColor: activeCameraObj.night_vision_mode === "NORMAL" ? "#00f59b" : "#1e293b",
                  color: activeCameraObj.night_vision_mode === "NORMAL" ? "#0a0f1d" : "#94a3b8",
                }}
              >
                <Sun size={12} />
                <span>OFF</span>
              </button>
            </div>
          </div>

          {/* Live Video Viewport */}
          <div style={styles.videoContainer}>
            {!imgError ? (
              <img
                src={`${API_BASE}/video_feed/${activeCamId}`}
                alt={`Surveillance Feed ${activeCamId}`}
                style={styles.videoStream}
                onError={() => setImgError(true)}
              />
            ) : (
              <div style={styles.fallbackScreen}>
                <Radio size={40} color="#00f59b" style={{ animation: "pulse 2s infinite" }} />
                <p style={styles.fallbackTitle}>CONNECTING TO SENSOR NODE CAM-{activeCamId}...</p>
                <p style={styles.fallbackText}>
                  Endpoint: <code>/video_feed/{activeCamId}</code> ({activeCameraObj.name})
                </p>
                <button onClick={() => setImgError(false)} style={styles.retryBtn}>
                  <RefreshCw size={14} />
                  <span>Reconnect Camera Feed</span>
                </button>
              </div>
            )}

            {/* Tactical HUD Badges & Overlays */}
            <div style={styles.feedOverlayTopLeft}>
              <span style={styles.tacticalBadge}>{activeCameraObj.coordinates}</span>
              <span style={styles.tacticalBadge}>
                ACTIVE TARGETS: {activeCameraObj.active_tracks} | BREACHES: {activeCameraObj.breach_count}
              </span>
            </div>

            <div style={styles.feedOverlayTopRight}>
              <span style={styles.tacticalBadgeGreen}>
                {activeCameraObj.status === "ONLINE" ? "SENSOR ONLINE // ARMED" : `SENSOR [${activeCameraObj.status}]`}
              </span>
            </div>

            <div style={styles.feedOverlayBottom}>
              <span style={styles.geofenceNotice}>
                [--- SAFE ZONE ▲ | VIRTUAL ZERO-LINE GEOFENCE BOUNDARY | ▼ RESTRICTED ZONE ---]
              </span>
            </div>
          </div>

          {/* Video Footer Telemetry Bar */}
          <div style={styles.feedFooter}>
            <div style={styles.feedFooterItem}>
              <Activity size={14} color="#00f59b" />
              <span>CAPTURE: {activeCameraObj.capture_fps.toFixed(1)} FPS</span>
            </div>
            <div style={styles.feedFooterItem}>
              <Server size={14} color="#38bdf8" />
              <span>INFERENCE: {activeCameraObj.inference_fps.toFixed(1)} FPS ({activeCameraObj.latency_ms.toFixed(1)}ms)</span>
            </div>
            <div style={styles.feedFooterItem}>
              <Layers size={14} color="#f59e0b" />
              <span>ZERO-LINE GEOFENCE: ARMED</span>
            </div>
            <div style={styles.feedFooterItem}>
              <Compass size={14} color="#94a3b8" />
              <span>BEARING: 042° NE</span>
            </div>
          </div>
        </div>

        {/* Right Panel: Threat Incident Telemetry Log & Deduplicated Stream */}
        <div style={styles.incidentPanel}>
          <div style={styles.incidentHeader}>
            <div style={styles.incidentTitleGroup}>
              <ShieldAlert size={18} color="#ef4444" />
              <span style={styles.incidentTitle}>TACTICAL THREAT INCIDENT LOG</span>
            </div>
            <span style={styles.alertCountBadge}>{alerts.length} LATEST EVENTS</span>
          </div>

          <div style={styles.alertList}>
            {alerts.map((alert) => {
              const isCrit = alert.threat_level === "CRITICAL" || alert.geofence_breach;
              const isHigh = alert.threat_level === "HIGH";
              const isMedium = alert.threat_level === "MEDIUM";
              const borderColor = isCrit ? "#ef4444" : isHigh ? "#f59e0b" : isMedium ? "#eab308" : "#38bdf8";
              const bgColor = isCrit
                ? "rgba(239, 68, 68, 0.08)"
                : isHigh
                ? "rgba(245, 158, 11, 0.06)"
                : "rgba(56, 189, 248, 0.04)";

              return (
                <div
                  key={alert.id}
                  style={{
                    ...styles.alertCard,
                    borderColor,
                    backgroundColor: bgColor,
                  }}
                >
                  <div style={styles.alertCardTop}>
                    <div style={styles.alertThreatTag}>
                      <span
                        style={{
                          ...styles.threatLevelBadge,
                          backgroundColor: borderColor,
                          color: "#0a0f1d",
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
                      <span style={styles.alertDetailKey}>Sector / Location:</span>
                      <span style={styles.alertDetailVal}>{alert.sector}</span>
                    </div>

                    <div style={styles.alertDetailRow}>
                      <span style={styles.alertDetailKey}>AI Confidence:</span>
                      <span style={styles.alertDetailValConfidence}>{alert.confidence.toFixed(1)}%</span>
                    </div>

                    {alert.direction && (
                      <div style={styles.alertDetailRow}>
                        <span style={styles.alertDetailKey}>Movement Direction:</span>
                        <span style={styles.alertDetailVal}>{alert.direction}</span>
                      </div>
                    )}

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

                    {alert.evidence_snapshot && (
                      <button
                        onClick={() => setPreviewSnapshot(alert)}
                        style={styles.evidenceBtn}
                      >
                        <Camera size={13} />
                        <span>VIEW EVIDENCE SNAPSHOT</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Incident Stream Footer */}
          <div style={styles.incidentFooter}>
            <div style={styles.incidentFooterInfo}>
              <Terminal size={14} color="#64748b" />
              <span>Real-Time Deduplicated Telemetry Stream</span>
            </div>
            <button
              onClick={() =>
                setAlerts([
                  {
                    id: `ack-${Date.now()}`,
                    cam_id: activeCamId,
                    sector: activeCameraObj.name,
                    threat: "TARGET_ACKNOWLEDGED_CLEARED",
                    confidence: 100.0,
                    threat_level: "INFO",
                    event: "OPERATOR_ACKNOWLEDGED",
                    geofence_breach: false,
                    timestamp: new Date().toLocaleTimeString(),
                  },
                  ...alerts.slice(0, 9),
                ])
              }
              style={styles.ackBtn}
            >
              <CheckCircle2 size={13} />
              <span>Acknowledge Log</span>
            </button>
          </div>
        </div>
      </main>

      {/* ================= EVIDENCE SNAPSHOT PREVIEW MODAL ================= */}
      {previewSnapshot && (
        <div style={styles.modalBackdrop} onClick={() => setPreviewSnapshot(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Camera size={18} color="#00f59b" />
                <span style={styles.modalTitle}>CRITICAL BREACH EVIDENCE SNAPSHOT: {previewSnapshot.id}</span>
              </div>
              <button style={styles.modalCloseBtn} onClick={() => setPreviewSnapshot(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <img
                src={`${API_BASE}${previewSnapshot.evidence_snapshot}`}
                alt="Breach Evidence"
                style={styles.modalImage}
              />
              <div style={styles.modalMetaGrid}>
                <div>
                  <span style={styles.metaLabel}>Sector:</span>
                  <span style={styles.metaVal}>{previewSnapshot.sector}</span>
                </div>
                <div>
                  <span style={styles.metaLabel}>Target:</span>
                  <span style={styles.metaVal}>{previewSnapshot.threat}</span>
                </div>
                <div>
                  <span style={styles.metaLabel}>Confidence:</span>
                  <span style={{ ...styles.metaVal, color: "#00f59b" }}>{previewSnapshot.confidence}%</span>
                </div>
                <div>
                  <span style={styles.metaLabel}>Time:</span>
                  <span style={styles.metaVal}>{previewSnapshot.timestamp}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111827",
    padding: "12px 18px",
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
    fontSize: "1.18rem",
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
    fontSize: "0.76rem",
    color: "#94a3b8",
    margin: "3px 0 0 0",
    letterSpacing: "0.02em",
  },
  headerTelemetryStrip: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  telemetryPill: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "#0d1322",
    border: "1px solid #1e293b",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#cbd5e1",
    letterSpacing: "0.03em",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid",
  },
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    boxShadow: "0 0 8px currentColor",
  },
  statusDotSmall: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    marginLeft: "4px",
  },
  inlineDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    display: "inline-block",
    marginRight: "4px",
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
    padding: "8px 14px",
    borderRadius: "6px",
    fontWeight: 700,
    fontSize: "0.78rem",
    letterSpacing: "0.05em",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  hudGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "12px",
  },
  hudCard: {
    backgroundColor: "#111827",
    borderRadius: "8px",
    padding: "12px 16px",
    border: "1px solid #1f293d",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
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
    fontSize: "0.76rem",
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
    fontSize: "1.65rem",
    fontWeight: 800,
    letterSpacing: "0.03em",
    color: "#f8fafc",
  },
  hudSubUnit: {
    fontSize: "0.78rem",
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
    display: "flex",
    alignItems: "center",
  },
  hudCaption: {
    fontSize: "0.74rem",
    color: "#64748b",
    margin: "2px 0 0 0",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1.35fr 1fr",
    gap: "14px",
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
    padding: "8px 14px",
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
    fontSize: "0.75rem",
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  feedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 14px",
    backgroundColor: "#0d1322",
    borderBottom: "1px solid #1e293b",
    flexWrap: "wrap",
    gap: "8px",
  },
  feedTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  feedTitle: {
    fontSize: "0.82rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "#f8fafc",
  },
  resTag: {
    fontSize: "0.68rem",
    fontWeight: 700,
    backgroundColor: "#1e293b",
    color: "#94a3b8",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  nightVisionControls: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  nvLabel: {
    fontSize: "0.68rem",
    fontWeight: 700,
    color: "#64748b",
  },
  nvBtn: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    border: "none",
    padding: "3px 8px",
    borderRadius: "4px",
    fontSize: "0.68rem",
    fontWeight: 700,
    cursor: "pointer",
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
    fontSize: "0.92rem",
    fontWeight: 700,
    color: "#00f59b",
    letterSpacing: "0.05em",
    margin: 0,
  },
  fallbackText: {
    fontSize: "0.78rem",
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
    fontSize: "0.76rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  feedOverlayTopLeft: {
    position: "absolute",
    top: "10px",
    left: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  feedOverlayTopRight: {
    position: "absolute",
    top: "10px",
    right: "10px",
  },
  feedOverlayBottom: {
    position: "absolute",
    bottom: "8px",
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
    fontSize: "0.66rem",
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: "4px",
    letterSpacing: "0.06em",
  },
  feedFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 14px",
    backgroundColor: "#0d1322",
    borderTop: "1px solid #1e293b",
    flexWrap: "wrap",
    gap: "8px",
  },
  feedFooterItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.74rem",
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
    padding: "10px 14px",
    backgroundColor: "#0d1322",
    borderBottom: "1px solid #1e293b",
  },
  incidentTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  incidentTitle: {
    fontSize: "0.82rem",
    fontWeight: 800,
    letterSpacing: "0.06em",
    color: "#f8fafc",
  },
  alertCountBadge: {
    fontSize: "0.68rem",
    fontWeight: 700,
    backgroundColor: "#1e293b",
    color: "#94a3b8",
    padding: "2px 8px",
    borderRadius: "4px",
    border: "1px solid #334155",
  },
  alertList: {
    flex: 1,
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    overflowY: "auto",
    maxHeight: "480px",
  },
  alertCard: {
    borderRadius: "8px",
    border: "1px solid",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
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
    fontSize: "0.66rem",
    fontWeight: 900,
    padding: "2px 6px",
    borderRadius: "3px",
    letterSpacing: "0.06em",
  },
  threatName: {
    fontSize: "0.82rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "#f8fafc",
  },
  alertTime: {
    fontSize: "0.70rem",
    color: "#64748b",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
  },
  alertCardDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  alertDetailRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.76rem",
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
    marginTop: "3px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    color: "#ef4444",
    padding: "3px 8px",
    borderRadius: "4px",
    fontSize: "0.70rem",
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
    padding: "3px 8px",
    borderRadius: "4px",
    fontSize: "0.70rem",
    fontWeight: 700,
    border: "1px solid rgba(245, 158, 11, 0.3)",
  },
  evidenceBtn: {
    marginTop: "4px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "#1e293b",
    color: "#38bdf8",
    border: "1px solid #38bdf8",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "0.70rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  incidentFooter: {
    padding: "8px 12px",
    backgroundColor: "#0d1322",
    borderTop: "1px solid #1e293b",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  },
  incidentFooterInfo: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.70rem",
    color: "#64748b",
  },
  ackBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    color: "#f8fafc",
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "0.70rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  modalBackdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  },
  modalContent: {
    backgroundColor: "#111827",
    borderRadius: "10px",
    border: "1px solid #00f59b",
    boxShadow: "0 0 30px rgba(0, 245, 155, 0.2)",
    maxWidth: "680px",
    width: "100%",
    overflow: "hidden",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "#0d1322",
    borderBottom: "1px solid #1e293b",
  },
  modalTitle: {
    fontSize: "0.84rem",
    fontWeight: 800,
    color: "#00f59b",
    letterSpacing: "0.04em",
  },
  modalCloseBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
  },
  modalBody: {
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  modalImage: {
    width: "100%",
    borderRadius: "6px",
    border: "1px solid #334155",
    maxHeight: "380px",
    objectFit: "contain",
    backgroundColor: "#000",
  },
  modalMetaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    backgroundColor: "#080d19",
    padding: "10px",
    borderRadius: "6px",
    fontSize: "0.76rem",
  },
  metaLabel: {
    color: "#64748b",
    marginRight: "6px",
  },
  metaVal: {
    color: "#f8fafc",
    fontWeight: 700,
  },
};