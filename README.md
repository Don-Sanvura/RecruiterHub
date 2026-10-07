# RecruiterHub

A static recruiter pitch-card studio and company research hub built with HTML, CSS, and JavaScript. It requires no sign-in, server, API, Firebase, or environment variables.

## Data storage

Company records and candidate skills are saved in this browser's local storage. Attachments are saved in this browser's IndexedDB. Data is not shared with other devices or browsers. Clearing browser/site data can delete saved records and files, so export important company data regularly with **Download Excel**.

## Run locally

Requires Node.js 20 or newer and npm.

```powershell
npm ci
npm run dev
```

The app can also be built as static files:

```powershell
npm run build
npm run preview
```

## Publish on GitHub Pages

The included GitHub Actions workflow builds and publishes the static site whenever changes are pushed to `main`.

1. In the repository, open **Settings → Pages** and select **GitHub Actions** as the build and deployment source.
2. Push to `main` and wait for the **Deploy static site to GitHub Pages** workflow to finish.
3. The site will be available at `https://<owner>.github.io/recruiterhub.github.io/`.

The repository uses project Pages, so the build sets the Vite base path to `/recruiterhub.github.io/`.
