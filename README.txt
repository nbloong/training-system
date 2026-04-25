BBE Staff Training Tracker - Firebase Audit-Ready Version

Upgrades:
- No Expiry checkbox for individual training and mass training.
- Rule Type: Has Expiry / No Expiry.
- No Expiry status displays as "Valid – No Expiry".
- Expired/expiring reports ignore no-expiry training.
- Evidence is handled by Google Drive / OneDrive links, not Firebase Storage.
- Mass attendance inherits expiry/no-expiry from the session.
- CSV audit export included.

Setup:
1. Replace firebase-config.js with your actual Firebase config.
2. Upload index.html, style.css, app.js and firebase-config.js to GitHub repo root.
3. Enable Firestore Database in Firebase.
4. Open your GitHub Pages site.
5. Click "Load SG/WSH Default Rules".
