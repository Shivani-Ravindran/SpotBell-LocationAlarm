import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import MainScreen from "./mainScreen"

export default function LogoScreen() {
  const [showLogo, setLogo] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLogo(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (showLogo) {
    return (
      <View style={styles.container}>
        <Image
          source={require("../assets/icon.png")}
          style={styles.logo}
          contentFit="contain"
        />

      </View>
    );
  }
  return <MainScreen />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#01123E",
    justifyContent: "center",
    alignItems: "center",
  },
  mainContainer: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 300,
    height: 300,
  },
});
