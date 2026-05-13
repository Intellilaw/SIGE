import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "SIGE Mobile",
  slug: "sige-mobile",
  version: "0.1.1",
  orientation: "portrait",
  icon: "./assets/app-icon.png",
  userInterfaceStyle: "light",
  scheme: "sige",
  splash: {
    image: "./assets/app-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  android: {
    package: "com.intellilaw.sige.mobile",
    versionCode: 2,
    adaptiveIcon: {
      foregroundImage: "./assets/app-icon.png",
      backgroundColor: "#ffffff"
    }
  },
  extra: {
    eas: {
      projectId: "e7d2e8bd-325d-4dee-a605-6b1420f49957"
    }
  }
};

export default config;
