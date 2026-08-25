const API = "http://localhost:8000";

export interface AuthRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  message: string;
  username: string;
}

export interface DetectResponse {
  status: "SAFE" | "THREAT";
  faces: number;
  emotion: string;
  confidence: number; // 0-1
  message: string;
  timestamp: string;
  face_detected: boolean;
  motion_detected: boolean;
  threat_detected: boolean;
}

// ================= API CALLS =================

export const signup = async (data: AuthRequest): Promise<AuthResponse> => {
  const res = await fetch(`${API}/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Signup failed");
  return res.json();
};

export const login = async (data: AuthRequest): Promise<AuthResponse> => {
  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Login failed");
  return res.json();
};

export interface AlertItem {
  time: string;
  status: "SAFE" | "THREAT";
  message: string;
  faces: number;
  confidence: number;
  emotion?: string;
  motion_detected?: boolean;
  threat_detected?: boolean;
}

export interface HealthResponse {
  status: string;
  service: string;
  users: number;
  alerts: number;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.detail || data?.message || "Request failed");
  }

  return data as T;
}

function normalizeConfidence(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return numericValue > 1 ? numericValue / 100 : numericValue;
}

function normalizeStatus(value: unknown): "SAFE" | "THREAT" {
  return value === "THREAT" ? "THREAT" : "SAFE";
}

export async function detect(): Promise<DetectResponse> {
  const response = await fetch(`${API}/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const data = await parseResponse<Record<string, unknown>>(response);

  const face_detected = Boolean(data.face_detected);
  const motion_detected = Boolean(data.motion_detected);
  const threat_detected = Boolean(data.threat_detected);
  const status = threat_detected ? "THREAT" : "SAFE";
  const faces = face_detected ? 1 : 0;
  const emotion = typeof data.emotion === "string" ? data.emotion : "Unknown";
  const confidence = normalizeConfidence(data.confidence ?? 0);

  const message = threat_detected 
    ? `Threat detected: ${emotion} (${Math.round(confidence * 100)}%)`
    : face_detected 
      ? "Face detected successfully"
      : "No face detected";

  return {
    status,
    faces,
    emotion,
    confidence,
    message,
    timestamp: new Date().toISOString(),
    face_detected,
    motion_detected,
    threat_detected,
  } as DetectResponse;

}

export async function getAlerts(): Promise<AlertItem[]> {
  const response = await fetch(`${API}/detect/alerts`);

  if (response.status === 404) {
    return [];
  }

  const data = await parseResponse<{ alerts?: Array<Record<string, unknown>> }>(response);

  return (data.alerts ?? []).map((alert) => ({
    time: typeof alert.time === "string" ? alert.time : new Date().toISOString(),
    status: alert.threat_detected ? "THREAT" : "SAFE",
    message: typeof alert.message === "string" ? alert.message : "Threat alert",
    faces: 1,
    confidence: normalizeConfidence(alert.confidence ?? 0),
    emotion: typeof alert.emotion === "string" ? alert.emotion : undefined,
    motion_detected: Boolean(alert.motion_detected),
    threat_detected: Boolean(alert.threat_detected),
  })) as AlertItem[];

}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API}/health`);
  return parseResponse<HealthResponse>(response);
}

export { API };
