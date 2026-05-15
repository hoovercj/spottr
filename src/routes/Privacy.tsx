import { Typography } from '@mui/material';
import { StaticPage } from '@/routes/StaticPage';

export function Privacy() {
  return (
    <StaticPage title="Privacy Policy" lastUpdated="2026-05-15">
      <Typography variant="body1">
        Spottr is a personal-use, local-first workout log. The short version: your data lives in
        your browser; it goes nowhere else unless you explicitly turn on a backup destination, and
        even then it goes only to a place you control.
      </Typography>

      <Typography variant="h2">What Spottr stores</Typography>
      <Typography variant="body1">
        Spottr records the workout data you enter — exercises, sets, reps, weights, notes,
        timestamps, locations, and the routines you create. Everything is written to your browser's
        IndexedDB. Spottr does not require an account and does not transmit your data to any server
        operated by the app's authors.
      </Typography>

      <Typography variant="h2">Backups</Typography>
      <Typography variant="body1">You choose where Spottr writes its periodic backups:</Typography>
      <Typography variant="body1" component="ul" sx={{ pl: 3, m: 0 }}>
        <li>
          <strong>Local folder</strong> — a directory you pick on your device via the browser's File
          System Access API. The file lives on your disk; Spottr can read or overwrite the backup
          files but nothing else in that folder.
        </li>
        <li>
          <strong>Downloads folder</strong> — each export triggers a normal browser download.
        </li>
        <li>
          <strong>Google Drive</strong> — Spottr uses Google's OAuth 2.0 flow with the
          <code> drive.file </code>
          scope. That scope strictly limits Spottr to files it has itself created in your Drive: a
          folder called &quot;Spottr&quot; and the two backup files inside it (
          <code>spottr-backup.json</code> and <code>spottr-backup.csv</code>). Spottr cannot read,
          modify, or list any other file in your Drive. Your access token is held only in your
          browser's memory and is discarded when you disconnect.
        </li>
      </Typography>

      <Typography variant="h2">What Spottr does not do</Typography>
      <Typography variant="body1" component="ul" sx={{ pl: 3, m: 0 }}>
        <li>No accounts, no sign-up, no profiles.</li>
        <li>No analytics, no telemetry, no fingerprinting, no advertising trackers.</li>
        <li>No cookies set by Spottr itself.</li>
        <li>No third-party services other than Google when you explicitly enable Drive backups.</li>
      </Typography>

      <Typography variant="h2">Hosting</Typography>
      <Typography variant="body1">
        Spottr is served as a static Progressive Web App from GitHub Pages. GitHub may log standard
        request metadata (IP address, user agent) when your browser loads the app, per the
        <a
          href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement"
          target="_blank"
          rel="noopener noreferrer"
        >
          {' '}
          GitHub Privacy Statement
        </a>
        . Spottr's authors do not have access to those logs.
      </Typography>

      <Typography variant="h2">Open source</Typography>
      <Typography variant="body1">
        Spottr is open source. You can audit exactly what data is collected and where it goes at
        <a href="https://github.com/hoovercj/spottr" target="_blank" rel="noopener noreferrer">
          {' '}
          github.com/hoovercj/spottr
        </a>
        .
      </Typography>

      <Typography variant="h2">Contact</Typography>
      <Typography variant="body1">
        Questions or concerns: open an issue at{' '}
        <a
          href="https://github.com/hoovercj/spottr/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/hoovercj/spottr/issues
        </a>
        .
      </Typography>
    </StaticPage>
  );
}
