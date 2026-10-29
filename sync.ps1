# Sync plugin into the DSH profile (run after editing code).
$src = "E:\Allen\plugins\dsh-comfy-canvas"
$dst = "C:\Users\Administrator\.dsh\profiles\desktop\node_modules\@local\dsh-comfy-canvas"

if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item -Recurse $src $dst
Write-Host "Synced to $dst"
Write-Host "Restart DSH to load the canvas tab."
