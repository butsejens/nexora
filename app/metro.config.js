const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Voeg alias toe voor '@' naar './'
config.resolver.alias = {
	...(config.resolver.alias || {}),
	'@': path.resolve(__dirname),
};

const expoRouterAssetPattern = /^expo-router\/assets\/.+\.(png|jpg|jpeg|webp)$/i;
const fallbackAsset = path.join(__dirname, "assets", "images", "icon.png");
const previousResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (expoRouterAssetPattern.test(moduleName)) {
		return context.resolveRequest(context, fallbackAsset, platform);
	}

	if (previousResolveRequest) {
		return previousResolveRequest(context, moduleName, platform);
	}

	return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
