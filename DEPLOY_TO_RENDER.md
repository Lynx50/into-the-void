# Into the Void Deployment Guide

This is the simplest production path for this project:

- host the API on Render
- host Postgres on Neon
- point the Android app at the Render HTTPS URL

## What I already prepared

- `render.yaml` at the repo root for the API service
- production env examples in:
  - `artifacts/api-server/.env.example`
  - `artifacts/into-the-void/.env.example`

## What you need to do

### 1. Put the repo on GitHub

Render works best when it can deploy from a GitHub repo.

If the repo is not on GitHub yet:

1. Create a new GitHub repository.
2. Upload this project to it.

### 2. Create the production database in Neon

1. Go to [Neon](https://neon.tech/).
2. Create an account or sign in.
3. Create a new project.
4. Copy the connection string Neon gives you.

It will look similar to:

```text
postgresql://username:password@ep-something.eu-west-2.aws.neon.tech/neondb?sslmode=require
```

This value is your production `DATABASE_URL`.

### 3. Create the API service in Render

1. Go to [Render](https://render.com/).
2. Create an account or sign in.
3. Click `New` -> `Blueprint`.
4. Connect your GitHub account.
5. Select your repository.
6. Render should detect `render.yaml`.
7. Continue the setup.

When Render asks for environment variables, set:

- `DATABASE_URL`
  - paste the Neon connection string
- `CORS_ORIGINS`
  - use your future app/web origins
  - if you do not have custom domains yet, start with:

```text
https://intothevoid.app,https://www.intothevoid.app
```

Render will generate `SESSION_SECRET` automatically from `render.yaml`.

### 4. Wait for the deploy to finish

When the deploy is done, Render will give you a public API URL.

It will look similar to:

```text
https://into-the-void-api.onrender.com
```

Your app API base URL becomes:

```text
https://into-the-void-api.onrender.com/api
```

### 5. Point the app at the production API

Open:

- `artifacts/into-the-void/.env`

Replace the current value with your real Render API URL:

```env
VITE_API_BASE_URL=https://into-the-void-api.onrender.com/api
```

### 6. Rebuild the Android app

Run:

```powershell
cd "C:\Users\willi\Downloads\Void-Thoughts (1)\Void-Thoughts\artifacts\into-the-void"
node .\node_modules\vite\bin\vite.js build --config vite.config.ts
node .\node_modules\@capacitor\cli\bin\capacitor sync android
```

Then reinstall and run from Android Studio.

## Final production security step

After the app is talking to the HTTPS Render API, switch Android networking back to secure production defaults.

That means in `artifacts/into-the-void/capacitor.config.ts` you should use:

```ts
server: {
  cleartext: false,
},
android: {
  cleartext: false,
  allowMixedContent: false,
  loggingBehavior: "debug",
},
```

Right now the project is temporarily relaxed so local HTTP testing works.

## How to test the hosted API

Open this in a browser:

```text
https://your-render-service.onrender.com/api/healthz
```

You should see:

```json
{"status":"ok"}
```

## Minimum checklist before public release

1. Neon database created
2. Render API deployed
3. `DATABASE_URL` set in Render
4. `CORS_ORIGINS` set in Render
5. app `.env` changed to the Render HTTPS API
6. Android app rebuilt and reinstalled
7. local HTTP allowances removed again before store release
