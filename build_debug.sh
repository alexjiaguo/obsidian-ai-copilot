#!/bin/bash
echo "Starting build process..."
npm install
npm run build > build_output.log 2>&1
echo "Build process finished with exit code $?"
ls -l main.js
head -n 20 build_output.log
