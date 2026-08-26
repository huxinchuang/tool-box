#!/usr/bin/env bash
# tool-box 后端一键部署脚本（Windows Git Bash / Linux 均可运行）
# 用法：SERVER_HOST=43.139.150.115 SERVER_PASS='2015.huge' bash deploy.sh
# 说明：
#   - 将 server/（含 data/game.db 数据库）打包上传到远程服务器 ~/tool-box-server
#   - 远程执行 npm install
#   - 安装并重启 systemd 服务 toolbox-server（开机自启 + 崩溃自动重启）
set -e

SERVER_HOST="${SERVER_HOST:-43.139.150.115}"
SERVER_USER="${SERVER_USER:-ubuntu}"
SERVER_PASS="${SERVER_PASS:-}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$SERVER_PASS" ]; then
  echo "❌ 请通过环境变量提供密码：SERVER_PASS=xxx bash deploy.sh"
  exit 1
fi

# 密码自动输入（OpenSSH >= 8.4 的 SSH_ASKPASS_REQUIRE=force 机制）
ASKPASS="$(mktemp)"
cat > "$ASKPASS" << EOF
#!/bin/sh
echo '$SERVER_PASS'
EOF
chmod +x "$ASKPASS"
export SSH_ASKPASS="$ASKPASS"
export SSH_ASKPASS_REQUIRE=force
export DISPLAY=dummy
SSH="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20"
SCP="scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20"

echo "=== 1/5 打包 server（不含数据库：服务器数据为生产数据，保留并自动备份） ==="
PKG="$(mktemp).tar.gz"
tar -czf "$PKG" -C "$PROJECT_DIR/server" --exclude=node_modules --exclude='*.bak*' --exclude=data .

echo "=== 2/5 上传到 $SERVER_USER@$SERVER_HOST:~/tool-box-server ==="
$SSH $SERVER_USER@$SERVER_HOST "mkdir -p ~/tool-box-server && [ -f ~/tool-box-server/data/game.db ] && cp ~/tool-box-server/data/game.db ~/tool-box-server/data/game.db.bak.\$(date +%s) && echo '已备份服务器数据库' || echo '服务器暂无数据库'" < /dev/null
$SCP "$PKG" $SERVER_USER@$SERVER_HOST:~/tool-box-server/package.tar.gz < /dev/null

echo "=== 3/5 解压 + 安装依赖 ==="
$SSH $SERVER_USER@$SERVER_HOST 'cd ~/tool-box-server && tar -xzf package.tar.gz && rm package.tar.gz && npm install --omit=dev 2>&1 | tail -1' < /dev/null

echo "=== 4/5 安装 systemd 服务 ==="
cat > /tmp/toolbox-server.service << 'EOF'
[Unit]
Description=tool-box API server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/tool-box-server
ExecStart=/usr/bin/node --experimental-sqlite index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
$SCP /tmp/toolbox-server.service $SERVER_USER@$SERVER_HOST:~/toolbox-server.service < /dev/null
$SSH $SERVER_USER@$SERVER_HOST "echo '$SERVER_PASS' | sudo -S cp ~/toolbox-server.service /etc/systemd/system/toolbox-server.service && echo '$SERVER_PASS' | sudo -S systemctl daemon-reload && echo '$SERVER_PASS' | sudo -S systemctl enable toolbox-server >/dev/null 2>&1; echo '$SERVER_PASS' | sudo -S systemctl restart toolbox-server" < /dev/null

echo "=== 5/5 验证 ==="
sleep 2
$SSH $SERVER_USER@$SERVER_HOST "curl -s http://127.0.0.1:3000/api/health && echo && systemctl status toolbox-server --no-pager | head -3" < /dev/null

rm -f "$ASKPASS" "$PKG" /tmp/toolbox-server.service
echo "✅ 部署完成"
