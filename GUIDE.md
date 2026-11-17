# MedRecords guide

## What it is

MedRecords keeps your family's health records in one place.
It runs only in your browser. There is no server and no account.

Open it at **https://gargshishirr.github.io/MedRecords/**.

## Features

- A profile for each family member.
- Records: visits, lab reports, prescriptions, scans, vaccines and documents.
- Lab trends with charts and reference ranges.
- Medicines with a daily checklist and refill reminders.
- Appointments and health readings (blood pressure, weight and more).
- An emergency card with a QR code you can print.
- An optional passcode lock that encrypts everything.
- Backups you can export and import.
- Light and dark themes, a ⌘K / Ctrl+K search, and it works on phones.

## How to use

### First visit

- Choose **Try the demo** to look around with a fictional family.
- Choose **Start fresh** to use it for your own family.
- Already tried the demo? Go to **Settings → Start fresh**.

### Add your family

- Click **Add a family member**. Start with yourself.
- Only the name, birth date and sex are needed. Add the rest later.
- Switch between people with the profile menu (top left, or your initials on a phone).
- Edit or delete people in **Settings → Family members**.

### Records, labs and medicines

- **Records → Add record** for visits, reports and other papers.
- **Lab trends → Add result** for numbers like HbA1c or cholesterol.
- **Medications → Add medication**. Tick morning, afternoon or night to see it in the daily checklist.
- **Overview** has **Add reading** (vitals) and appointments (**Add**).
- To change or delete something, open it and use **Edit** or **Delete**.

### The emergency card

- Open **Emergency card**. Check the details, then click **Print card**.
- The QR code holds plain text only: exactly what the page shows.
- Under **Show on the card**, untick what you don't want on it.

### The lock

- **Settings → Lock with a passcode**. Use at least 8 characters.
- The app locks after 5 minutes without use. You can change the time.
- **Lock now** (in Settings or ⌘K) locks all open tabs.
- Wrong passcodes make you wait longer each time.

### Backups

- **Settings → Export**. Pick **Encrypted** (needs a passcode) or **Plain JSON**.
- **Settings → Import** loads a backup and replaces what is there. It asks first.

## Keep it safe

- Your data stays in this browser on this device. Other devices can't see it.
- Use the lock on shared devices. Don't let the browser save the passcode there.
- If you forget the passcode, the data can't be recovered. Keep a backup.
- Back up regularly, and keep backups somewhere private.
- Clearing browser data (or "site data") deletes everything.
- It is not medical advice. Always check with your doctor.

## Maintain it

### Run it locally

```bash
nvm use            # Node 22
npm ci
npm run dev        # http://localhost:5173
```

### Run the tests

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

### How deploys work

- Every pull request runs the checks (`.github/workflows/ci.yml`).
- Merge to `main` → `deploy.yml` checks, builds and publishes to GitHub Pages.
- It is live a minute or two later.

### Updating dependencies

- Run `npm outdated` to see what is old.
- Update in small steps (`npm update`, or one major version at a time).
- Run the tests and `npm run build`, then open a pull request.

## Troubleshooting

- **"MedRecords is locked" and I forgot the passcode.** It can't be reset. Use **Forgot your passcode? → Erase all data**, then import a backup.
- **My data is gone.** The browser's site data was cleared, or you are in another browser or a private window. Import your latest backup.
- **The import fails.** Use a MedRecords backup file under 5 MB. The message says what is wrong.
- **The lock option is missing.** Open the app over HTTPS in an up-to-date browser. Encryption needs it.
- **It locks too often.** Change **Settings → Lock after**.
