$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot
node .\functions\node_modules\firebase-tools\lib\bin\firebase.js emulators:start --only functions,firestore --project openhash-test
