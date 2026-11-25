#!/bin/zsh -l
set -e
cd -- "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  for node_dir in "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin(N); do
    if "$node_dir/node" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
      export PATH="$node_dir:$PATH"
      break
    fi
  done
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  print '请先安装 Node.js 22 或更新版本。'
  read -r "?按回车结束 "
  exit 1
fi
if [[ ! -d node_modules/sharp ]]; then
  npm install --no-audit --no-fund
fi
port="${PORT:-4173}"
if curl -fs http://127.0.0.1:"$port"/api/config >/dev/null 2>&1; then
  open "http://127.0.0.1:$port/"
  exit 0
fi
node server.mjs &
workbench_pid=$!
trap 'kill "$workbench_pid" 2>/dev/null || true' EXIT INT TERM
for ((i=0; i<50; i++)); do
  if curl -fs http://127.0.0.1:"$port"/api/config >/dev/null 2>&1; then
    open "http://127.0.0.1:$port/"
    break
  fi
  if ! kill -0 "$workbench_pid" 2>/dev/null; then break; fi
  sleep .1
done
wait "$workbench_pid"
