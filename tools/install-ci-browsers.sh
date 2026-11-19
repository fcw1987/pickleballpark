#!/usr/bin/env bash
set -euo pipefail

# Match the Pages preview runner's signed Ubuntu archive. The Azure mirror has
# taken over 25 minutes to deliver the browser libraries on hosted runners.
for sources in /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources /etc/apt/apt-mirrors.txt; do
  if [[ -f "$sources" ]] && grep -qF '://azure.archive.ubuntu.com/' "$sources"; then
    sudo sed -i 's|://azure\.archive\.ubuntu\.com/|://archive.ubuntu.com/|g' "$sources"
  fi
done

exec npx playwright install --with-deps "$@"
