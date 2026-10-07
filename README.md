# RecruiterHub

A responsive Recruiter Hub and company Info Hub. Firestore keeps company records and candidate skills in sync in real time across devices. Firebase Storage stores shared recruiter attachments. The pages do not require a user sign-in.

## Local development

Requirements: Node.js 20 or newer and npm.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Fill in the Firebase web app values in `.env.local`, then run:

```powershell
npm run dev
```

## Separate page links

- Recruiter Hub: `https://your-domain/recruiterhub.html`
- Info Hub: `https://your-domain/infohub.html`

The Info Hub has links back to the home page and Recruiter Hub. Its **Download Excel** action exports a workbook with summary, company, and recruiter-audit sheets.

## Firebase setup

1. Create a Firebase project, register a Web app, enable Cloud Firestore, and create a Firebase Storage bucket.
2. Copy the Web app configuration into `.env.local`, matching the variable names in `.env.example`. These Firebase web settings are visible in the browser; never put service-account keys in the frontend or a `VITE_` variable.
3. Deploy the included Firestore and Storage rules. Install/use the Firebase CLI, select the project, and deploy the rules:

   ```powershell
   npx firebase-tools login
   npx firebase-tools use --add
   npx firebase-tools deploy --only firestore:rules,storage
   ```

4. Build and deploy `dist/`. Configure the same `VITE_FIREBASE_*` variables in the hosting provider before building.

Firestore listeners update the Info Hub when company records change, including changes made from another device. Candidate skills and uploaded attachments are shared through Firestore and Firebase Storage too. On first load, existing company records in this browser are imported to Firestore; locally stored attachments are uploaded during that migration. Keep the browser profile containing your old data available until the import has completed.

## Firestore data schema

Firestore is schemaless; [`firestore.rules`](firestore.rules) validates writes against these document shapes:

### `company_records/{recordId}`

`recordId` must equal the document's `id`.

```json
{
  "id": "record-uuid",
  "company": "Example Company",
  "site": "https://example.com",
  "offer": "Company products and services",
  "job": "Role or career notes",
  "notes": "Research notes or generated pitch",
  "status": "Researching",
  "source": "info-hub",
  "recruiterName": "",
  "referralName": "",
  "referralEmail": "",
  "referralContext": "",
  "attachmentPath": "",
  "submittedAt": null,
  "updatedAt": 1791345000000
}
```

`source` is either `info-hub` or `recruiter-re-audit`. The recruiter fields, attachment path, and submission date are populated by RE-audit submissions; ordinary research records use empty strings and a null submission date.

All fields shown in the example are required by the Firestore rules. Text limits are: `id` 128, `company` 120, `site` 2,000, `offer` and `job` 4,000 each, `notes` 10,000, `status` 40, `recruiterName` and `referralName` 120 each, `referralEmail` 254, `referralContext` 4,000, and `attachmentPath` 2,048 characters. `updatedAt` is a Unix timestamp in milliseconds; `submittedAt` is an ISO date string or `null`.

### `hub_settings/candidate`

```json
{
  "skills": "full-stack engineering, AI/LLM integration",
  "updatedAt": 1791345000000
}
```

Both fields are required; `skills` is limited to 500 characters and `updatedAt` is a Unix timestamp in milliseconds.

Attachments are stored in Firebase Storage at `attachments/{unique-filename}`; the download URL is saved as `attachmentPath` on the related record.

## Public access warning

The supplied rules allow anyone with the app/project identifiers to read, add, edit, and delete company records and attachments without signing in. This meets the no-login shared-access requirement, but the data is public and can be changed by visitors. Do not store confidential or sensitive information. Enable Firebase App Check and monitoring before broad public use.

## Production deployment

```powershell
npm ci
npm run build
```

Deploy the generated `dist/` directory to Firebase Hosting or another static host. Firebase web config variables must be present at build time.

The spoken submission thank-you uses the browser Speech Synthesis API when available and leaves an on-screen confirmation as fallback. Voice selection and playback depend on the user's browser/device settings.
