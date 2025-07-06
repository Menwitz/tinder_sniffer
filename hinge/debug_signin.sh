#!/usr/bin/env bash
# debug_hinge_signin.sh

RAPIDAPI_KEY="YOUR_RAPIDAPI_KEY"
HOST="hinge-v1-terminal-rest.p.rapidapi.com"
URL="https://$HOST/sessions"

debug_signin() {
  phone_raw="$1"
  # Try both with and without the leading '+'
  for phone in "$phone_raw" "${phone_raw#+}"; do
    echo -e "\n=== Testing sign-in for: $phone ==="
    curl -i --verbose \
      -X POST "$URL" \
      -H "Content-Type: application/json" \
      -H "X-RapidAPI-Key: $RAPIDAPI_KEY" \
      -H "X-RapidAPI-Host: $HOST" \
      -d "{\"phone_number\":\"$phone\"}"
  done
}

# Debug with your number and an invalid one
debug_signin "19296318842"
debug_signin "invalid_number"