const { withGradleProperties } = require("@expo/config-plugins");
const baseConfig = require("./app.json");

const expo = baseConfig.expo || {};

// Raise the Gradle JVM heap so Android release builds don't run out of Metaspace.
const withHighMemoryGradle = (config) =>
  withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (item) => !(item.type === "property" && item.key === "org.gradle.jvmargs"),
    );
    mod.modResults.push({
      type: "property",
      key: "org.gradle.jvmargs",
      value: "-Xmx6g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError",
    });
    return mod;
  });

module.exports = () => ({
  ...expo,
  owner: expo.owner || "butsejens",
  plugins: [...(expo.plugins || []), withHighMemoryGradle],
});
