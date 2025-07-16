#!/bin/bash

# Script to update the IP address in your API config
# Run this script when your IP address changes

echo "🔍 Detecting your current IP address..."

# Get the current IP address
CURRENT_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')

if [ -z "$CURRENT_IP" ]; then
    echo "❌ Could not detect IP address"
    exit 1
fi

echo "📍 Current IP: $CURRENT_IP"

# Update the API config file
echo "📝 Updating API config..."

# Create a backup
cp src/config/api.ts src/config/api.ts.backup

# Update the IP address in the config
sed -i '' "s/return '[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}';/return '$CURRENT_IP';/" src/config/api.ts

echo "✅ API config updated with IP: $CURRENT_IP"
echo "🔄 Restart your app to use the new IP address"
echo "💡 If you need to revert, run: cp src/config/api.ts.backup src/config/api.ts" 