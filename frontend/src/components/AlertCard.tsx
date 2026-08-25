export type AlertModel = {
  id: string;
  time: string;
  severity: 'green' | 'yellow' | 'red';
  level: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  feed: string;
  location: string;
  confidence: number;
  status: 'open' | 'resolved' | 'dispatched';
  isNew?: boolean;
};

type AlertCardProps = {
  alert: AlertModel;
  onResolve: (id: string) => void;
  onDispatch: (id: string) => void;
};

const statusText: Record<AlertModel['status'], string> = {
  open: 'Open',
  resolved: 'Resolved',
  dispatched: 'Dispatched',
};

export default function AlertCard({ alert, onResolve, onDispatch }: AlertCardProps) {
  return (
    <article className={`alert-item ${alert.severity} ${alert.status} ${alert.isNew ? 'new-alert' : ''}`}>
      <div className="alert-meta">
        <div>
          <p className="alert-title">{alert.title}</p>
          <p className="alert-subtitle">{alert.message}</p>
        </div>
        <span className={`badge small ${alert.severity}`}>{statusText[alert.status]}</span>
      </div>
      <div className="alert-details">
        <div>
          <span className="badge small blue">{alert.feed}</span>
          <span className={`badge small ${alert.severity}`}>{alert.level.toUpperCase()}</span>
        </div>
        <div className="alert-score">
          <span>{alert.confidence}%</span>
          <span>Confidence</span>
        </div>
      </div>
      <div className="alert-footer">
        <div className="alert-meta-row">
          <span className="alert-time">{alert.time}</span>
          <span className="alert-location">{alert.location}</span>
        </div>
        <div className="alert-actions">
          <button className="action-button" onClick={() => onResolve(alert.id)} disabled={alert.status !== 'open'}>
            Mark as Resolved
          </button>
          <button className="action-button secondary" onClick={() => onDispatch(alert.id)} disabled={alert.status !== 'open'}>
            Dispatch Security
          </button>
        </div>
      </div>
    </article>
  );
}
