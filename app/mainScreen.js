import React, { useEffect, useState, useRef } from "react";
import { PROVIDER_GOOGLE } from "react-native-maps";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  TouchableOpacity,
  Alert, Linking,
  AppState
} from "react-native";
import { LogBox } from "react-native";
LogBox.ignoreLogs([
  "expo-av has been deprecated",
  "Expo AV has been deprecated"
]);
import MapView, { Polyline, Marker } from "react-native-maps";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const BACKGROUND_LOCATION_TASK = "BACKGROUND_LOCATION_TASK";
let isRinging = false;
let soundObject = null;

const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const convertToMapCoords = (osrmCoords) => {
  return osrmCoords.map(([lon, lat]) => ({
    latitude: lat,
    longitude: lon,
  }));
};


const playLoopingAlarm = async () => {
  //To play looping alarm
  if (soundObject) {
    console.log("Audio already playing, skipping duplicate.");
    return;
  }

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldRouteThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      require("../assets/alarm.wav"),
      { isLooping: true }
    );
    soundObject = sound;
    await soundObject.playAsync();
  } catch (err) {
    console.log("Error playing looping audio", err);
  }
};

const stopLoopingAlarm = async () => {
  //stop the looping alarm and avoid overlapping loops
  if (soundObject) {
    try {
      await soundObject.stopAsync();
      await soundObject.unloadAsync();
      soundObject = null;
    } catch (err) {
      console.log("Error stopping looping audio", err);
    }
  }
};

const triggerAlarm = async () => {
  //Run the alarm and avoid ringing if already working
  if (isRinging) return;
  isRinging = true;

  //Cancel old notifications 
  try {
    const existingId = await AsyncStorage.getItem("alarm_notification_id");
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
    }
  } catch (e) {
    console.log("Error clearing old alarm", e);
  }

  await playLoopingAlarm();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Wake Up!",
      body: "You are near your destination 🚆",
      sound: "alarm.wav",
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: null
  });
  await AsyncStorage.setItem("alarm_notification_id", id);
};

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  //Run as background task using task manager if app goes to background
  if (error) {
    console.log("Background location error:", error);
    return;
  }
  if (data) {
    //data comes from location listner from Location.startLocationUpdatesAsync
    const { locations } = data;
    if (!locations || locations.length === 0) return;
    const currentLocation = locations[0].coords;

    // Read the active alarm state from AsyncStorage since we can't access React state here
    try {
      const activeAlarmStr = await AsyncStorage.getItem("active_alarm");
      if (activeAlarmStr) {
        const activeAlarm = JSON.parse(activeAlarmStr);
        if (activeAlarm.triggered) return; // Prevent infinite re-triggering

        const distanceToDestination = getDistanceInMeters(
          currentLocation.latitude,
          currentLocation.longitude,
          activeAlarm.destination.latitude,
          activeAlarm.destination.longitude
        );

        if (distanceToDestination <= activeAlarm.wakeupRadius * 1000) {
          if (isRinging) return;

          activeAlarm.triggered = true;
          await AsyncStorage.setItem("active_alarm", JSON.stringify(activeAlarm));

          await triggerAlarm();

          // We can also stop the background task now that we arrived
          try {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          } catch (e) {
            console.log("Task stop error:", e);
          }
        }
      }
    } catch (err) {
      console.log("Error processing background location logic:", err);
    }
  }
});

export default function MainScreen() {
  const [location, setLocation] = useState(null);
  const [latitudeInput, setLatitudeInput] = useState("");
  const [longitudeInput, setLongitudeInput] = useState("");
  const [wakeupInput, setWakeupInput] = useState("");
  const [alarmTriggered, setAlarmTriggered] = useState(false);
  const mapRef = useRef(null);
  const locationSubscriber = useRef(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const lastFetchLocation = useRef(null);
  const [destination, setDestination] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const customMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#8e8e93" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#1d1d1d" }] },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#2c2c2c" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#0e0e0e" }],
    },
  ];

  useEffect(() => {
    //Request permission on opening app and set watcher for user location
    (async () => {
      await Notifications.requestPermissionsAsync();
      let foregroundStatus = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus.status !== "granted") {
        Alert.alert(
          "Location Required",
          "SpotBell needs location permission to calculate your route and wake you up.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }

      let backgroundStatus = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus.status !== "granted") {
        Alert.alert(
          "Background Location Required",
          "SpotBell must have 'Always' location access to wake you up effectively when your phone is locked.",
          [
            { text: "Continue anyway", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() }
          ]
        );
      }

      const activeAlarmStr = await AsyncStorage.getItem("active_alarm");
      if (activeAlarmStr) {
        const activeAlarm = JSON.parse(activeAlarmStr);
        setDestination(activeAlarm.destination);
        setWakeupInput(activeAlarm.wakeupRadius.toString());
        if (activeAlarm.triggered) {
          setAlarmTriggered(true);
          isRinging = true;
        }
      }

      try {
        locationSubscriber.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
          },
          (loc) => {
            setLocation(loc.coords);
            mapRef.current?.animateCamera({
              center: {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              },
            });
          },
        );
      }
      catch (e) {
        console.log("Location setup error:", e);
      }
    })();
    return () => {
      if (locationSubscriber.current) {
        locationSubscriber.current.remove();
        locationSubscriber.current = null;
      }
    };
  }, []);

  useEffect(() => {
    //If app triggered alarm in background, update UI accordingly 
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "active") {
        try {
          const activeAlarmStr = await AsyncStorage.getItem("active_alarm");
          if (activeAlarmStr) {
            const activeAlarm = JSON.parse(activeAlarmStr);
            if (activeAlarm.triggered) {
              setAlarmTriggered(true);
              isRinging = true;
            }
          }
        } catch (err) {
          console.log(err);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    //Listen for foreground notifications
    const foregroundNotifSub = Notifications.addNotificationReceivedListener(notification => {
      setAlarmTriggered(true);
      isRinging = true;
    });

    return () => {
      foregroundNotifSub.remove();
    };
  }, []);

  useEffect(() => {
    //Should we re-route?
    if (!location || !destination) {
      return;
    }

    const maybeFetchRoute = async () => {
      if (!lastFetchLocation.current) {
        await fetchAndStoreRoute();
      }
      const distanceToDestination = getDistanceInMeters(
        location.latitude,
        location.longitude,
        destination.latitude,
        destination.longitude,
      );

      // We still do this in the foreground just in case they have the app open and the background task doesn't fire fast enough
      if (
        !alarmTriggered &&
        distanceToDestination <= parseFloat(wakeupInput) * 1000
      ) {
        setAlarmTriggered(true);

        const activeAlarmStr = await AsyncStorage.getItem("active_alarm");
        if (activeAlarmStr) {
          const activeAlarm = JSON.parse(activeAlarmStr);
          activeAlarm.triggered = true;
          await AsyncStorage.setItem("active_alarm", JSON.stringify(activeAlarm));
        }

        if (!isRinging) {
          await triggerAlarm();
        }

        Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).then(started => {
          if (started) {
            Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          }
        });
      }

      const last = lastFetchLocation.current;
      const distanceMoved = getDistanceInMeters(
        last.latitude,
        last.longitude,
        location.latitude,
        location.longitude,
      );

      //Fetch and store result only if moved more than 50 meters
      if (distanceMoved < 50) return;
      await fetchAndStoreRoute();
    };

    maybeFetchRoute();
  }, [location, destination, wakeupInput]);

  const fetchAndStoreRoute = async () => {
    const osrmGeometry = await fetchRoute(location, destination);
    if (!osrmGeometry) {
      console.log("Failed to fetch route geometry");
      return;
    }
    const coords = convertToMapCoords(osrmGeometry);
    setRouteCoords(coords);
    lastFetchLocation.current = location;
  };

  const fetchRoute = async (start, end) => {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${start.longitude},${start.latitude};` +
      `${end.longitude},${end.latitude}` +
      `?overview=full&geometries=geojson`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.routes?.length) return null;
      return data.routes[0].geometry.coordinates;
    } catch (e) {
      console.log("Error fetching route:", e);
      return null;
    }
  };

  const stopAlarm = async () => {
    // Stop continuous looping audio
    await stopLoopingAlarm();

    try {
      const id = await AsyncStorage.getItem("alarm_notification_id");
      if (id) {
        await Notifications.cancelScheduledNotificationAsync(id);
        await AsyncStorage.removeItem("alarm_notification_id");
      }
      await Notifications.dismissAllNotificationsAsync();
    } catch (e) {
      console.log("Error dismissing notifications:", e);
    }

    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (e) {
      console.log("Error stopping background location:", e);
    }

    // Mark the journey as complete by clearing the destination
    setDestination(null);
    setRouteCoords([]);
    lastFetchLocation.current = null;
    await AsyncStorage.removeItem("active_alarm");
    setAlarmTriggered(false);
    isRinging = false;
  };

  const handleSetDestination = async () => {
    const lat = parseFloat(latitudeInput);
    const lon = parseFloat(longitudeInput);
    const wakeupDistance = parseFloat(wakeupInput);

    if (wakeupDistance < 1 || wakeupDistance > 20 || isNaN(wakeupDistance)) {
      alert("Wakeup Distance must be between 1 and 20 km");
      return;
    }

    if (!isNaN(lat) && !isNaN(lon)) {
      // Clean up previous alarm state if any
      const existingId = await AsyncStorage.getItem("alarm_notification_id");
      if (existingId) {
        await Notifications.cancelScheduledNotificationAsync(existingId);
        await AsyncStorage.removeItem("alarm_notification_id");
      }
      await Notifications.dismissAllNotificationsAsync();

      setRouteCoords([]);
      setAlarmTriggered(false);
      isRinging = false;
      lastFetchLocation.current = null;

      const newDestination = { latitude: lat, longitude: lon };
      setDestination(newDestination);

      mapRef.current?.animateCamera({
        center: { latitude: lat, longitude: lon },
        zoom: 14,
      });
      Keyboard.dismiss();

      // Store the active alarm context for the Background Task to read
      await AsyncStorage.setItem("active_alarm", JSON.stringify({
        destination: newDestination,
        wakeupRadius: wakeupDistance,
        triggered: false
      }));

      // Tell iOS to start tracking us in the background
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 1,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "SpotBell is active",
          notificationBody: "Tracking your train progress...",
        }
      });

    } else {
      alert("Please enter valid numbers");
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: location?.latitude || 22.5937,
          longitude: location?.longitude || 78.9629,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        customMapStyle={customMapStyle}
        moveOnMarkerPress={false}
      >
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={4}
            strokeColor="#003616"
            zIndex={10}
          />
        )}
        {destination && (
          <Marker
            coordinate={{
              latitude: destination.latitude,
              longitude: destination.longitude,
            }}
            pinColor="#4c0703"
            title="Destination"
          />
        )}
        {location && (
          <Marker
            coordinate={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            title="Location"
            pinColor="#00CFFF"
          />
        )}
      </MapView>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.inputWrapper}
        pointerEvents="box-none"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View
            style={[
              styles.inputContainer,
              collapsed && styles.inputContainerCollapsed,
            ]}
          >
            {!collapsed && (
              <>
                <Text style={styles.label}>Destination Latitude:</Text>
                <TextInput
                  style={styles.input}
                  value={latitudeInput}
                  onChangeText={setLatitudeInput}
                  keyboardType="numeric"
                />

                <Text style={styles.label}>Destination Longitude:</Text>
                <TextInput
                  style={styles.input}
                  value={longitudeInput}
                  onChangeText={setLongitudeInput}
                  keyboardType="numeric"
                />

                <Text style={styles.label}>WakeUp Distance(km):</Text>
                <TextInput
                  style={styles.input}
                  value={wakeupInput}
                  onChangeText={setWakeupInput}
                  keyboardType="numeric"
                />

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleSetDestination}
                >
                  <Text style={styles.buttonText}>Set Destination</Text>
                </TouchableOpacity>
                {alarmTriggered && (
                  <TouchableOpacity
                    style={styles.button}
                    onPress={stopAlarm}
                  >
                    <Text style={styles.buttonText}>
                      Stop Alarm
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.reduceButton}
              onPress={() => setCollapsed(!collapsed)}
            >
              <Text style={styles.buttonArrow}>{collapsed ? "▼" : "▲"}</Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  inputContainer: {
    position: "absolute",
    top: 40,
    left: 10,
    right: 10,
    padding: 15,
    paddingBottom: 45,
    backgroundColor: "#01123E",
    borderRadius: 12,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    marginVertical: 5,
    borderRadius: 8,
    color: "white",
  },
  button: {
    backgroundColor: "#4c0703",
    borderRadius: 10,
    paddingVertical: 12,
    marginVertical: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  label: {
    color: "white",
  },
  reduceButton: {
    borderRadius: 10,
    alignItems: "center",
    width: 50,
    position: "absolute",
    right: 10,
    bottom: 0,
    transform: [{ translateY: -12 }],
  },
  buttonArrow: {
    color: "white",
    fontSize: 25,
    fontWeight: "bold",
  },
  inputContainerCollapsed: {
    height: 60,
    padding: 10,
  },
  inputWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
