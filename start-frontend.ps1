$ErrorActionPreference = 'Stop'

Set-Location -Path (Join-Path $PSScriptRoot 'frontend')
node .\node_modules\vite\bin\vite.js --host 127.0.0.1
