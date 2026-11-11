# Windows version of fetch-models.sh. Run from the lingualink-play folder:
#   powershell -ExecutionPolicy Bypass -File scripts\fetch-models.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
New-Item -ItemType Directory -Force -Path models | Out-Null
Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" -OutFile "models\face_landmarker.task"
Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" -OutFile "models\hand_landmarker.task"
Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" -OutFile "models\pose_landmarker_lite.task"
Get-ChildItem models\*.task
Write-Host "Done. Fish Feast and Firefly Night will now load their models from .\models."
