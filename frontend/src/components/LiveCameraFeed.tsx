import { RefObject } from 'react';

type LiveCameraFeedProps = {
  videoRef: RefObject<HTMLVideoElement>;
  streamActive: boolean;
  cameraError: string | null;
  label: string;
  location: string;
  onDetect: () => void;
  detecting: boolean;
  faceStatus: string;
  detectionResult: { status: 'SAFE' | 'THREAT' | null; message: string; confidence: number } | null;
};

export default function LiveCameraFeed({
  videoRef,
  streamActive,
  cameraError,
  label,
  location,
  onDetect,
  detecting,
  faceStatus,
  detectionResult,
}: LiveCameraFeedProps) {
  return (
    <div className="live-camera-card">
      <div className="camera-card-header">
        <div>
          <p className="eyebrow">Live Camera</p>
          <h3>{label}</h3>
          <p className="muted-text">{location}</p>
        </div>
        <span className="badge green">LIVE</span>
      </div>
      <div className="camera-frame-wrapper">
        {cameraError ? (
          <div className="camera-error">{cameraError}</div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-64 rounded-lg"
            style={{ width: '100%', height: '240px', objectFit: 'cover', borderRadius: '1rem' }}
          />
        )}
      </div>
      {detectionResult && (
        <div className={`detection-result ${detectionResult.status === 'THREAT' ? 'threat' : 'safe'}`}>
          <div className="detection-icon">{detectionResult.status === 'THREAT' ? '🔴' : '🟢'}</div>
          <div className="detection-text">
            <strong>{detectionResult.status === 'THREAT' ? 'THREAT DETECTED' : 'SAFE'}</strong>
            <p>{detectionResult.message}</p>
            <p>Confidence: {(detectionResult.confidence * 100).toFixed(1)}%</p>
          </div>
        </div>
      )}
      <div className="camera-controls">
        <button className="primary-button" onClick={onDetect} disabled={detecting || Boolean(cameraError)}>
          {detecting ? 'Scanning...' : 'Detect Face'}
        </button>
        <span className="status-footnote">{faceStatus}</span>
      </div>
    </div>
  );
}
