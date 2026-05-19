const fs = require("node:fs");
const path = require("node:path");

function readCentralAppVersion() {
  const versionFile = path.resolve(__dirname, "../../packages/contracts/src/app-version.ts");
  const source = fs.readFileSync(versionFile, "utf8");
  const match = source.match(/APP_VERSION\s*=\s*"([^"]+)"/);

  if (!match) {
    throw new Error(`Could not read APP_VERSION from ${versionFile}`);
  }

  return match[1];
}

const appVersion = readCentralAppVersion();

module.exports = {
  name: "SIGE Mobile",
  slug: "sige-mobile",
  version: appVersion,
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
    versionCode: 4,
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
