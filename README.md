# SpotBell

A location-based travel alarm that wakes you up before you miss your stop.

SpotBell replaces time-based alarms with GPS tracking — set a destination, choose a wake-up radius, and let the app alert you automatically as you approach your stop. Built for train journeys, long bus rides, and night travel.

---

## Why SpotBell?

Time alarms fail when trains are delayed, traffic is unpredictable, or routes change. SpotBell adapts in real time — so you travel confidently, however long the journey takes.

---

## Features

| Feature | Description |
|---|---|
| 📍 Location-based alarm | Triggers when you enter a configurable 1–20 km radius around your destination |
| 🔒 Background tracking | Continues running when the phone is locked, minimized, or in use |
| 🔔 Looping alarm | Loud alarm + system notification, loops until manually stopped |
| 🗺️ Route visualization | Live location, destination marker, and route polyline on map |
| 🔋 Smart tracking | Recalculates only after meaningful movement to conserve battery |

---

## How It Works

1. Enter destination coordinates + wake-up radius
2. Alarm state saved locally via AsyncStorage
3. Background location tracking begins
4. Distance to destination monitored continuously
5. On entering radius → alarm fires, notification sent, tracking stops

---

## Tech Stack

**Framework:** React Native + Expo

| Category | Library |
|---|---|
| Location | `expo-location`, `expo-task-manager` |
| Notifications | `expo-notifications` |
| Audio | `expo-av` |
| Maps | `react-native-maps` |
| Routing API | OSRM (public) |
| Storage | `AsyncStorage` |

---

## Getting Started

```bash
# Clone and install
git clone https://github.com/Shivani-Ravindran/SpotBell-LocationAlarm.git
cd SpotBell
npm install

# Generate native folders
npx expo prebuild

# Run
npx expo run:android
npx expo run:ios
```

**Required permissions:** Always-on location (foreground + background), notifications.

Android note: Disable battery optimization for SpotBell to ensure reliable background tracking.

---

## Project Structure

```
SpotBell/
├── assets/
├── app/
├── .gitignore
├── app.json
├── eas.json
├── metro.config.js
├── index.js
├── package.json
└── README.md
```

---

## Known Limitations

- GPS accuracy may degrade briefly in tunnels or low-signal areas
- Duplicate alert protection is built in, but extreme signal loss could affect timing

---

## Roadmap

- Tap-to-select destination on map
- Search-based destination input
- Offline fallback logic
- Vibration-only alarm mode
- Wearable device alerts

---

*Built as part of a mobile engineering learning project focused on background location tracking, notifications, and real-world travel safety.*
