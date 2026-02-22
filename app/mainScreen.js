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
  TouchableOpacity,
  Keyboard,
} from "react-native";
import MapView, { Polyline, Marker } from "react-native-maps";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";

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
    //Permission for alarms
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") {
        alert(
          "Notifications are disabled. You won't receive destination alerts.",
        );
      }
    })();
  }, []);

  useEffect(() => {
    //Watch for user location change
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("Permission denied");
        return;
      }
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
    })();
    return () => {
      if (locationSubscriber.current) {
        locationSubscriber.current.remove();
        locationSubscriber.current = null;
      }
    };
  }, []);

  useEffect(() => {
    //Should we re-route?
    if (!location || !destination) return;

    const maybeFetchRoute = async () => {
      if (!lastFetchLocation.current) {
        await fetchAndStoreRoute();
        return;
      }
      const distanceToDestination = getDistanceInMeters(
        location.latitude,
        location.longitude,
        destination.latitude,
        destination.longitude,
      );
      if (
        !alarmTriggered &&
        distanceToDestination <= parseFloat(wakeupInput) * 1000
      ) {
        triggerAlarm();
        setAlarmTriggered(true);
        if (locationSubscriber.current) {
          locationSubscriber.current.remove();
          locationSubscriber.current = null;
        }
      }

      const last = lastFetchLocation.current;
      const distanceMoved = getDistanceInMeters(
        last.latitude,
        last.longitude,
        location.latitude,
        location.longitude,
      );
      if (distanceMoved < 50) return;
      await fetchAndStoreRoute();
    };

    maybeFetchRoute();
  }, [location, destination]);

  const fetchAndStoreRoute = async () => {
    const osrmGeometry = await fetchRoute(location, destination);
    if (!osrmGeometry) return;
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
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes?.length) return null;
    return data.routes[0].geometry.coordinates;
  };

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

  const triggerAlarm = async () => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🚨 Destination Alert!",
        body: "You are approaching your destination.",
        sound: true,
        vibrate: true,
      },
      trigger: null,
    });
  };

  return (
    <View style={styles.container}>
      {/* Inputs floating above map */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.inputWrapper}
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
                  onPress={() => {
                    const lat = parseFloat(latitudeInput);
                    const lon = parseFloat(longitudeInput);
                    const wakeupDistance = parseFloat(wakeupInput);
                    if (
                      wakeupDistance < 1 ||
                      wakeupDistance > 20 ||
                      isNaN(wakeupDistance)
                    ) {
                      alert("Wakeup Distance must be between 1 and 20 km");
                      return;
                    }
                    if (!isNaN(lat) && !isNaN(lon)) {
                      setRouteCoords([]);
                      setAlarmTriggered(false);
                      lastFetchLocation.current = null;
                      setDestination({ latitude: lat, longitude: lon });
                      mapRef.current?.animateCamera({
                        center: { latitude: lat, longitude: lon },
                        zoom: 14,
                      });
                      Keyboard.dismiss();
                    } else {
                      alert("Please enter valid numbers");
                    }
                  }}
                >
                  <Text style={styles.buttonText}>Set Destination</Text>
                </TouchableOpacity>
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

      <MapView
        provider={PROVIDER_GOOGLE}
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
            strokeWidth={6}
            strokeColor="#000000"
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
    backgroundColor: "rgba(1, 18, 62, 0.65)", // semi-transparent dark
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
});
