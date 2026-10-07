# RecruiterHub

RecruiterHub combines a company research hub with a recruiter pitch-card studio. Vercel hosts the static pages and server-side API. The API authenticates authorized GitHub users with OAuth and stores shared records, candidate skills, and attachments in the configured GitHub repository.

## Set up GitHub storage

1. Create and initialize a dedicated **private data repository** (the template uses `Don-Sanvura/recruiterhub-data`) with a README and a `main` default branch. Keep it separate from the Vercel app repository so saved records do not trigger app deployments. Choose a trusted GitHub account for the OAuth connection. GitHub OAuth Apps request the broad `repo` permission; use an account that does not own unrelated sensitive repositories.
2. Create a GitHub OAuth App under **GitHub Settings → Developer settings → OAuth Apps**:
   - **Homepage URL:** the app's canonical URL, for example `https://your-app.vercel.app`
   - **Authorization callback URL:** that same URL followed by `/api/auth/callback`
   - Copy its client ID and generate a client secret.
3. In Vercel, import this repository as a project and set these **server-side** environment variables for Development, Preview, and Production as appropriate:

   | Variable | Value |
   | --- | --- |
   | `APP_URL` | The canonical app origin, with no trailing slash |
   | `GITHUB_CLIENT_ID` | OAuth App client ID |
   | `GITHUB_CLIENT_SECRET` | OAuth App client secret |
   | `GITHUB_ALLOWED_USERS` | Comma-separated GitHub logins allowed to use the app |
   | `GITHUB_REPOSITORY` | Repository that holds the data, in `owner/repository` form |
   | `GITHUB_BRANCH` | Branch where data commits are written, usually `main` |
   | `SESSION_SECRET` | A random secret of at least 32 characters |

   Generate a session secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Never add OAuth secrets or session secrets to client-side `VITE_` variables or commit them.
4. Set Vercel's **Production** `APP_URL` to the same origin configured in the OAuth App, save the variables, and redeploy. For local development, use a separate GitHub OAuth App whose callback URL is `http://localhost:3000/api/auth/callback`; copy its credentials into the ignored `.env.local` file and set `APP_URL=http://localhost:3000`.

The OAuth callback validates a one-time state value, checks the GitHub login against `GITHUB_ALLOWED_USERS`, and places the encrypted OAuth session in an HttpOnly cookie. The browser never receives the GitHub access token. All data-changing API calls also validate the request origin. Configure the GitHub account and allowed-user list carefully: a compromised OAuth account with `repo` permission could change repository contents.

On first save, the server creates `.recruiterhub/data.json` in the configured repository. Each successful data or attachment change is a GitHub commit. The JSON file is limited to 900 KB, and attachments are limited to 700 KB each to fit GitHub's contents API reliably. The app checks for updates every 30 seconds; it is shared across devices, but is not an instant real-time database. GitHub API limits, repository permissions, or a branch protection rule that blocks the OAuth account from writing will prevent changes from saving.

Do not put confidential or regulated information in a repository with public visibility. A private repository is strongly recommended.

## Local development

Requirements: Node.js 20 or newer, npm, a Vercel account/CLI session, a linked Vercel project, and the server environment variables above.

```powershell
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Fill in `.env.local` with the development OAuth App and repository values. If an older Firebase `.env.local` exists, replace its contents with the GitHub variables in `.env.example`. Then run the Vercel development server. It serves both the pages and `/api` functions:

```powershell
npx vercel@62.7.0 login
npx vercel@62.7.0 link
npm run dev
```

`npm run build` builds the static frontend. Vercel deploys the `api/` serverless functions with it. A static-only preview server does not provide the OAuth or data API; test a full deployment with `vercel dev` or a Vercel preview deployment.

## Data and migration

- Company records, recruiter RE-audits, and candidate skills are stored in `.recruiterhub/data.json`.
- Uploaded attachments are stored under `attachments/` in the configured GitHub repository.
- Existing company records cached in the current browser are copied into GitHub the first time an authorized user opens the Info Hub. Keep that browser profile available until migration completes.
- Attachments saved in the app's local browser storage are uploaded during migration. Old Firebase download URLs stay as legacy links; re-upload those files if you want them stored in GitHub instead.
- Because GitHub records every update as a commit, avoid large files or frequent bulk changes. The current app intentionally limits each attachment to 700 KB and the data file to 900 KB.

The Info Hub's **Download Excel** action exports summary, company, and recruiter-audit sheets. Excel generation runs only when requested.

## Deploy

Connect the repository to Vercel, add the production environment variables, configure the GitHub OAuth callback to `https://<your-production-domain>/api/auth/callback`, and deploy. After changing any environment variable, redeploy so the serverless functions receive it.
