#!/usr/bin/env bash
# LinguaLink Play: start a local server and open the browser.
cd "$(dirname "$0")"
URL="http://localhost:8080"
( sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) >/dev/null 2>&1 &
if command -v node >/dev/null; then exec node server.mjs; fi
exec python3 -m http.server 8080
