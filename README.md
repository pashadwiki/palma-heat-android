# 🌴 Palma Heat Android

**Run packages across Palma City. Outrun the law. Get paid.**

A top-down open-city driving & delivery game in the spirit of the classic GTA games — now packaged for Android with on-screen touch controls. Originally built as **"Palma Heat — Golden Hour"**, an entry to the make.fun *"Make GTA 6"* bounty (scored entry, November 2026), and wrapped into an Android APK so it can be played on a phone.

## The game

- 🗺️ **Palma City** — a living top-down city: traffic, pedestrians, shops (Arcade Nova, Pawn Shop, Club Coco, Garage 24H)
- 📦 **Package runs** — pick up jobs, deliver across town, get paid
- 🚓 **Wanted system** — break the law and the police heat rises, star by star
- 🚗 **Drive anything** — hop in and out of cars, nitro, handbrake drifts
- 🌇 **Golden hour** — the whole city bathed in sunset light

## Controls

**On Android (touch):**
- D-pad (bottom-left): move / steer / gas / reverse
- **MASUK** button: enter or leave a car
- 🔥: nitro · ✋: handbrake · ⏸: pause

**On desktop (keyboard):** WASD or arrow keys to move/drive, E or F to enter/leave a car, Shift for nitro, Space for handbrake, P pause, M mute.

## Play in a browser

Open `game/index.html` (serve the folder over HTTP, e.g. `python3 -m http.server` inside `game/`) — the same game, no install needed.

## Android build

The APK is a fullscreen WebView shell (`app/src/main/java/com/palmaheat/android/MainActivity.java`) around the web game in `app/src/main/assets/game/`, with touch controls added in `assets/game/touch.js`. Zero external dependencies.

Build it without Gradle (JDK 17 + Android SDK platform 34 / build-tools 34.0.0):

```sh
export JAVA_HOME=/path/to/jdk17
export ANDROID_HOME=/path/to/android-sdk
./build-apk.sh        # produces PalmaHeat.apk in the repo root
```

Or open the project in Android Studio / Gradle (AGP 8.5.2, compileSdk 34).

## License

MIT
