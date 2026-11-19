#!/usr/bin/env bash
# Palma Heat Android - manual APK build (no Gradle required).
# Needs: a JDK 17 and an Android SDK with platform android-34 + build-tools 34.0.0.
# Set ANDROID_HOME (or ANDROID_SDK_ROOT) to your SDK, JAVA_HOME to your JDK.
set -e
cd "$(dirname "$0")"
if [ -n "$JAVA_HOME" ]; then export PATH="$JAVA_HOME/bin:$PATH"; fi

ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
BT="$ANDROID_HOME/build-tools/34.0.0"
AJAR="$ANDROID_HOME/platforms/android-34/android.jar"
OUT=app/build/manual
rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

echo "[1/6] aapt2 compile"
"$BT/aapt2" compile --dir app/src/main/res -o "$OUT/compiled.zip"

echo "[2/6] aapt2 link"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$AJAR" \
  --manifest app/src/main/AndroidManifest.xml \
  -R "$OUT/compiled.zip" -A app/src/main/assets \
  --java "$OUT/gen" --auto-add-overlay

echo "[3/6] javac"
find app/src/main/java "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -encoding UTF-8 -cp "$AJAR" -d "$OUT/classes" @"$OUT/sources.txt"

echo "[4/6] d8"
"$BT/d8" --lib "$AJAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

echo "[5/6] package + align"
(cd "$OUT/dex" && zip -q ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "[6/6] sign (debug key)"
if [ ! -f "$HOME/.android/debug.keystore" ]; then
  mkdir -p "$HOME/.android"
  keytool -genkeypair -keystore "$HOME/.android/debug.keystore" -storepass android \
    -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" > /dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$HOME/.android/debug.keystore" --ks-pass pass:android \
  --key-pass pass:android --out PalmaHeat.apk "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs PalmaHeat.apk | head -3
echo "DONE: PalmaHeat.apk"
