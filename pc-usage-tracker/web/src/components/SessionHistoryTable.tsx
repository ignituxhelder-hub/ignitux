import { formatDuration, formatEur } from '../format';
import type { SessionRecord } from '../types';

interface SessionHistoryTableProps {
  sessions: SessionRecord[];
}

export default function SessionHistoryTable({ sessions }: SessionHistoryTableProps): JSX.Element {
  if (sessions.length === 0) {
    return <p>Aucune session enregistrée pour le moment.</p>;
  }

  return (
    <table className="history-table">
      <thead>
        <tr>
          <th>Service</th>
          <th>Début</th>
          <th>Fin</th>
          <th>Durée</th>
          <th>Montant</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => (
          <tr key={session.id}>
            <td>{session.serviceName}</td>
            <td>{new Date(session.startTime).toLocaleString('fr-FR')}</td>
            <td>{session.endTime ? new Date(session.endTime).toLocaleString('fr-FR') : 'en cours'}</td>
            <td>{session.durationSeconds === null ? '—' : formatDuration(session.durationSeconds)}</td>
            <td>{session.amountDueEur === null ? '—' : formatEur(session.amountDueEur)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
