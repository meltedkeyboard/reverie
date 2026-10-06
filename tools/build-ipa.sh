#!/bin/bash
# Local version of .github/workflows/ios.yml. Run from anywhere, it cds to the project root.
set -eo pipefail

cd "$(dirname "$0")/.."

# CocoaPods aborts without a UTF-8 locale; CI=1 stops expo from prompting.
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export CI=1

# Non-interactive shells do not read ~/.zshrc, so load the toolchains by hand.
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24

export PATH="$HOME/.rbenv/bin:$PATH"
eval "$(rbenv init - bash)"

command -v pod >/dev/null || { echo "pod not found, install cocoapods first"; exit 1; }

npm ci
npx expo prebuild --platform ios --clean

cd ios

fmt=cat
command -v xcbeautify >/dev/null && fmt=xcbeautify

workspace=$(ls -d *.xcworkspace | head -1)
scheme=${workspace%.xcworkspace}

xcodebuild archive \
  -workspace "$workspace" \
  -scheme "$scheme" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/app.xcarchive \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  | $fmt

rm -rf Payload ../Reverie.ipa
mkdir Payload
cp -R build/app.xcarchive/Products/Applications/*.app Payload/
zip -qry ../Reverie.ipa Payload

echo "Done: $(cd .. && pwd)/Reverie.ipa"
