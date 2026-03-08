#!/bin/bash

# Kill any stale processes from previous runs
fuser -k 8081/tcp 2>/dev/null || true
fuser -k 8082/tcp 2>/dev/null || true
fuser -k 5000/tcp 2>/dev/null || true
sleep 1

# Start Expo dev server on port 8082 in background
EXPO_PACKAGER_PROXY_URL=https://$REPLIT_DEV_DOMAIN \
REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_DEV_DOMAIN \
EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN \
npx expo start --localhost --port 8082 &

echo "Waiting for Expo Metro server..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:8082/ -o /dev/null 2>/dev/null; then
    echo "Expo ready after ${i}s"
    break
  fi
  sleep 1
done

# Pre-warm the web bundle in background (don't block startup)
curl -s "http://localhost:8082/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app" -o /dev/null 2>/dev/null &

# Start the Express backend on port 8081 (the external-facing port)
PORT=8081 npm run server:dev
