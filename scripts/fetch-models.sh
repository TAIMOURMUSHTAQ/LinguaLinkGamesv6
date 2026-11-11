#!/usr/bin/env bash
# Downloads the three MediaPipe model files into ./models so the camera games work offline
# and never contact Google at run time. Run once from the lingualink-play folder:
#   bash scripts/fetch-models.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p models
curl -L --fail -o models/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
curl -L --fail -o models/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
curl -L --fail -o models/pose_landmarker_lite.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
ls -lh models/*.task
echo "Done. Fish Feast and Firefly Night will now load their models from ./models."
