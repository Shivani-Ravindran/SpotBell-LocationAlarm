import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Button,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard
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
          <View style={styles.inputContainer}>
            <Text>Destination Latitude:</Text>
            <TextInput
              style={styles.input}
              value={latitudeInput}
              onChangeText={setLatitudeInput}
              keyboardType="numeric"
            />
            <Text>Destination Longitude:</Text>
            <TextInput
              style={styles.input}
              value={longitudeInput}
              onChangeText={setLongitudeInput}
              keyboardType="numeric"
            />
            <Text>WakeUp Distance(km):</Text>
            <TextInput
              style={styles.input}
              value={wakeupInput}
              onChangeText={setWakeupInput}
              keyboardType="numeric"
            />
            <Button
              title="Set Destination"
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
                } else alert("Please enter valid numbers");
              }}
            />
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: location?.latitude || 22.5937,
          longitude: location?.longitude || 78.9629,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeWidth={2} />
        )}
        {destination && (
          <Marker
            coordinate={{
              latitude: destination.latitude,
              longitude: destination.longitude,
            }}
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
    marginTop: 50,
    padding: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 5,
    marginVertical: 5,
    borderRadius: 5,
  },
});
