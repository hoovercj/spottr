# Google Drive backup — Cloud Console setup

Spottr's optional Google Drive destination uses **OAuth 2.0 with PKCE** via the **Google Identity Services Web** library. There's no server, no client secret, and no per-user backend storage — every signed-in user grants their own Google account to their own browser session. The "client ID" the app ships with is **public by design**.

What gates impostor apps is the list of **authorized JavaScript origins** in the Cloud Console: only requests coming from those origins can complete the OAuth dance.

The app uses the narrow `drive.file` scope — it can only see / write files it has itself created. The user's tax returns, photos, and unrelated docs remain invisible.

If `VITE_GOOGLE_OAUTH_CLIENT_ID` is unset at build time, the Drive option is hidden in the UI and the local-file destinations work normally. That's the safe default for forks.

---

## One-time Cloud Console setup

### 1. Create the project

1. Visit [https://console.cloud.google.com/](https://console.cloud.google.com/).
2. Project dropdown → **New Project**.
3. Name: `Spottr` (or whatever). Click **Create**.
4. Wait for the project to provision, then make sure it's selected in the dropdown.

### 2. Enable the Drive API

1. Navigation → **APIs & Services** → **Library**.
2. Search for **Google Drive API** → click → **Enable**.

### 3. Configure the OAuth consent screen

1. Navigation → **APIs & Services** → **OAuth consent screen**.
2. User type: **External**. Click **Create**.
3. **App information**:
   - App name: `Spottr`
   - User support email: your address
   - App logo: optional (skip for now)
4. **App domain**:
   - Application home page: `https://codyhoover.com/spottr/`
   - Application privacy policy: `https://codyhoover.com/spottr/privacy`
   - Application terms of service: `https://codyhoover.com/spottr/terms`
5. **Authorized domains**: add `codyhoover.com`.
6. **Developer contact information**: your email.
7. Save and continue.
8. **Scopes** step:
   - Click **Add or remove scopes**.
   - Filter for `drive.file` and tick the row whose scope is exactly `.../auth/drive.file` — labeled "See, edit, create, and delete only the specific Google Drive files you use with this app."
   - Save and continue.
9. **Test users** step:
   - Until the app is verified, only listed test users can sign in. Add your own email. Add anyone else you want to try it with. (Up to 100.)
   - Save and continue.
10. **Summary** → **Back to dashboard**.

### 4. Create the OAuth client

1. Navigation → **APIs & Services** → **Credentials**.
2. **Create credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Spottr Web`.
5. **Authorized JavaScript origins** — add each origin you'll auth from:
   - `https://codyhoover.com` (production)
   - `http://localhost:5173` (dev)
   - `http://localhost:4173` (vite preview)
6. **Authorized redirect URIs** — the Google Identity Services Web flow uses postMessage and doesn't strictly need a redirect URI, but adding the same origins doesn't hurt.
7. **Create**. Copy the client ID — it's an opaque string ending in `.apps.googleusercontent.com`.

### 5. Wire the client ID into the build

**Local dev:**

```bash
cp .env.example .env.local
# edit .env.local and paste the client ID into VITE_GOOGLE_OAUTH_CLIENT_ID
pnpm dev
```

**Production:**

The current GitHub Actions workflow (`.github/workflows/deploy.yml`) doesn't yet inject this. To enable Drive in the deployed build:

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `VITE_GOOGLE_OAUTH_CLIENT_ID`
   - Value: paste the client ID
2. Edit `.github/workflows/deploy.yml`, in the `build` job's `pnpm build` step:
   ```yaml
   - run: pnpm build
     env:
       VITE_GOOGLE_OAUTH_CLIENT_ID: ${{ secrets.VITE_GOOGLE_OAUTH_CLIENT_ID }}
   ```
3. Commit and push — the next deploy will surface the Drive option in the app.

### 6. (Eventually) submit for verification

Until then, Google warns test users with a "Google hasn't verified this app" screen on first connect. Users have to click **Advanced → Go to Spottr (unsafe)** to continue. Acceptable for personal use; not for general public.

For `drive.file` (non-sensitive scope), verification mostly requires:

- A working public privacy policy URL.
- Domain verification of `codyhoover.com` via Google Search Console (TXT record on the domain).
- A short questionnaire.

If you ever do submit, kick it off from **OAuth consent screen → Publishing status → Push to production**.

---

## How the app uses it

- `src/features/export/googleDrive.ts` lazy-loads the GIS script on first connect.
- On connect: requests an access token with the `drive.file` scope and consent prompt, then finds (or creates) a folder named `Spottr` in the user's My Drive. The folder id is persisted in IndexedDB.
- On every export: uses the cached access token (or silently re-requests one if expired) and uploads `spottr-backup.json` + `spottr-backup.csv` into the folder. If files with those names already exist, they are overwritten — Drive keeps prior revisions automatically.
- On disconnect (Settings): revokes the current token and forgets the folder id. Re-connecting re-discovers the folder and writes to it again.
