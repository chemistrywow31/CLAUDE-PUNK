#!/bin/bash
# CLAUDE PUNK App Builder
# This script builds the Electron app from the project root

cd "$(dirname "$0")/App"
npm run build
