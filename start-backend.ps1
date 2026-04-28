$ErrorActionPreference = 'Stop'

Set-Location -Path (Join-Path $PSScriptRoot 'backend')
node .\functions\node_modules\firebase-tools\lib\bin\firebase.js emulators:start --only functions,firestore --project openhash-test
