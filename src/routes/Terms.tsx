import { Typography } from '@mui/material';
import { StaticPage } from '@/routes/StaticPage';

export function Terms() {
  return (
    <StaticPage title="Terms of Service" lastUpdated="2026-05-15">
      <Typography variant="body1">
        Spottr is a personal-use, open-source workout log. By using it you agree to the terms below.
        If you disagree, don't use Spottr.
      </Typography>

      <Typography variant="h2">Use of the app</Typography>
      <Typography variant="body1">
        Spottr is provided free of charge for personal, non-commercial use. You may install it, run
        it offline, and back up your own data wherever you choose. You are responsible for your own
        data and for keeping your own backups.
      </Typography>

      <Typography variant="h2">No warranty</Typography>
      <Typography variant="body1">
        Spottr is provided &quot;as is&quot;, without warranty of any kind, express or implied,
        including but not limited to the warranties of merchantability, fitness for a particular
        purpose, and non-infringement. The authors make no guarantees that the app will be
        available, that your data will be preserved, that backups will succeed, or that the
        suggested weights are appropriate for your training.
      </Typography>

      <Typography variant="h2">Not fitness or medical advice</Typography>
      <Typography variant="body1">
        Any weight suggestions, progressions, or routines Spottr displays are heuristics generated
        from your own log, not coaching. They are not personalized fitness advice and are not a
        substitute for medical guidance, certified coaching, or your own judgment. Lifting is a
        physical activity with inherent risks; lift at your own discretion and consult a qualified
        professional if you have any concerns about whether a given exercise or load is right for
        you.
      </Typography>

      <Typography variant="h2">Limitation of liability</Typography>
      <Typography variant="body1">
        To the maximum extent permitted by law, the authors of Spottr shall not be liable for any
        direct, indirect, incidental, special, consequential, or exemplary damages — including but
        not limited to lost data, lost progress, lost time, or physical injury — arising out of or
        in connection with the use or inability to use Spottr.
      </Typography>

      <Typography variant="h2">Your data</Typography>
      <Typography variant="body1">
        Spottr stores your workout data on the device you used to enter it. If you choose to connect
        Google Drive, copies are placed in a folder you control in your own Drive. The authors of
        Spottr do not receive, retain, or have access to your workout data or your Google account.
        See the
        <a href="/spottr/privacy"> Privacy Policy</a> for details.
      </Typography>

      <Typography variant="h2">Open source</Typography>
      <Typography variant="body1">
        Spottr's source is published at
        <a href="https://github.com/hoovercj/spottr" target="_blank" rel="noopener noreferrer">
          {' '}
          github.com/hoovercj/spottr
        </a>
        . The license that governs the source code is published in that repository.
      </Typography>

      <Typography variant="h2">Changes</Typography>
      <Typography variant="body1">
        These terms may be updated as the app evolves. The &quot;Last updated&quot; date at the top
        of this page reflects the most recent change. Continued use of Spottr after a change
        constitutes acceptance of the revised terms.
      </Typography>
    </StaticPage>
  );
}
