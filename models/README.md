# Models

The MediaPipe model files are included here and served with the app:

- `face_landmarker.task` (Fish Feast, 3.8 MB)
- `hand_landmarker.task` (Firefly Night, Air Letters, Finger Numbers, Balance Tray, 7.8 MB)
- `pose_landmarker_lite.task` (Animal Moves, 5.8 MB)

They are loaded once per visit, reused by every level, and cached for offline use by the service worker.
To refresh them, run `bash scripts/fetch-models.sh` (or `scripts\fetch-models.ps1` on Windows).

If a file is missing, the game falls back to Google's public download link. If that also fails, the
game switches to touch mode and says so, so nothing breaks.
