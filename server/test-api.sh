#!/usr/bin/env bash
# 游戏币后端 API 集成测试（Linux / Git Bash 均可运行）
# 用法：bash test-api.sh [BASE_URL]，默认 http://127.0.0.1:3000
# 前置：先 npm run seed 创建管理员，再 npm start 启动服务
BASE_URL="${1:-http://127.0.0.1:3000}"
PASS=0; FAIL=0

# JSON 取值辅助：jq 不存在时用 node
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(eval('JSON.parse(d).'+process.argv[1]))}catch(e){console.log('')}})" "$1"; }

check() { # check <名称> <期望值> <实际值>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1";
  else FAIL=$((FAIL+1)); echo "  ❌ $1（期望=$2 实际=$3）"; fi
}

req() { # req <METHOD> <路径> [JSON体] [TOKEN]
  local method=$1 path=$2 body=${3:-} token=${4:-}
  local args=(-s -X "$method" "$BASE_URL$path" -H "Content-Type: application/json")
  [ -n "$body" ] && args+=(-d "$body")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  curl "${args[@]}"
}

echo "===== 1. 健康检查 ====="
R=$(req GET /api/health); check "health ok" "ok" "$(echo "$R" | json 'data.status')"

echo "===== 2. 认证 ====="
R=$(req POST /api/auth/login '{"username":"admin","password":"admin888"}')
ADMIN_TOKEN=$(echo "$R" | json 'data.token')
check "管理员登录" "admin" "$(echo "$R" | json 'data.user.username')"
R=$(req POST /api/auth/login '{"username":"admin","password":"wrong"}')
check "错误密码被拒绝(401)" "401" "$(echo "$R" | json 'code')"
R=$(req GET /api/auth/me)
check "无token被拒绝(401)" "401" "$(echo "$R" | json 'code')"
R=$(req GET /api/auth/me '' "$ADMIN_TOKEN")
check "me接口" "admin" "$(echo "$R" | json 'data.username')"

echo "===== 3. 创建玩家 ====="
UNIQ="p$(date +%s)"
R=$(req POST /api/admin/players "{\"username\":\"$UNIQ\",\"password\":\"p123456\",\"nickname\":\"测试玩家\"}" "$ADMIN_TOKEN")
check "创建玩家" "player" "$(echo "$R" | json 'data.role')"
PID=$(echo "$R" | json 'data.id')
R=$(req POST /api/admin/players "{\"username\":\"$UNIQ\",\"password\":\"p123456\"}" "$ADMIN_TOKEN")
check "重复账号被拒绝" "账号已存在" "$(echo "$R" | json 'message')"
R=$(req POST /api/admin/players '{"username":"bad name!","password":"p123456"}' "$ADMIN_TOKEN")
check "非法账号格式被拒绝" "400" "$(echo "$R" | json 'code')"
R=$(req GET /api/admin/players '' "$ADMIN_TOKEN")
check "玩家列表包含新玩家" "$UNIQ" "$(echo "$R" | json "data.find(u=>u.username==='$UNIQ').username")"

echo "===== 4. 加/减游戏币 ====="
R=$(req POST /api/admin/adjust "{\"playerId\":$PID,\"amount\":100,\"remark\":\"充值\"}" "$ADMIN_TOKEN")
check "加100币" "100" "$(echo "$R" | json 'data.balance')"
R=$(req POST /api/admin/adjust "{\"playerId\":$PID,\"amount\":-30,\"remark\":\"消费扣减\"}" "$ADMIN_TOKEN")
check "减30币" "70" "$(echo "$R" | json 'data.balance')"
R=$(req POST /api/admin/adjust "{\"playerId\":$PID,\"amount\":-100}" "$ADMIN_TOKEN")
check "超额扣减被拒绝" "余额不足，无法扣减" "$(echo "$R" | json 'message')"
R=$(req POST /api/admin/adjust "{\"playerId\":9999,\"amount\":10}" "$ADMIN_TOKEN")
check "不存在的玩家(404)" "404" "$(echo "$R" | json 'code')"

echo "===== 5. 变动历史（管理员视角） ====="
R=$(req GET "/api/transactions?playerId=$PID" '' "$ADMIN_TOKEN")
check "历史条数=2" "2" "$(echo "$R" | json 'data.total')"
check "最新一条是减30" "-30" "$(echo "$R" | json 'data.list[0].amount')"
R=$(req GET "/api/transactions?playerId=$PID&order=asc" '' "$ADMIN_TOKEN")
check "asc排序第一条是加100" "100" "$(echo "$R" | json 'data.list[0].amount')"

echo "===== 5.5 百分比增减 ====="
PCT_UNIQ="pct$UNIQ"
R=$(req POST /api/admin/players "{\"username\":\"$PCT_UNIQ\",\"password\":\"p123456\"}" "$ADMIN_TOKEN")
PCTPID=$(echo "$R" | json 'data.id')
req POST /api/admin/adjust "{\"playerId\":$PCTPID,\"amount\":100}" "$ADMIN_TOKEN" >/dev/null
R=$(req POST /api/admin/adjust "{\"playerId\":$PCTPID,\"base\":100,\"percent\":5}" "$ADMIN_TOKEN")
check "百分比加5%(基数100×5%=5)" "5" "$(echo "$R" | json 'data.amount')"
check "加后余额=105" "105" "$(echo "$R" | json 'data.balance')"
check "百分比模式标记" "percent" "$(echo "$R" | json 'data.mode')"
R=$(req POST /api/admin/adjust "{\"playerId\":$PCTPID,\"base\":100,\"percent\":-5}" "$ADMIN_TOKEN")
check "百分比扣5%(-5)" "-5" "$(echo "$R" | json 'data.amount')"
check "扣后余额=100" "100" "$(echo "$R" | json 'data.balance')"
R=$(req POST /api/admin/adjust "{\"playerId\":$PCTPID,\"base\":200,\"percent\":5}" "$ADMIN_TOKEN")
check "基数超过余额被拒绝" "基数不能超过当前余额" "$(echo "$R" | json 'message')"
R=$(req POST /api/admin/adjust "{\"playerId\":$PCTPID,\"base\":100,\"percent\":0}" "$ADMIN_TOKEN")
check "百分比为0被拒绝" "百分比不能为 0" "$(echo "$R" | json 'message')"
R=$(req GET "/api/transactions?playerId=$PCTPID&order=asc" '' "$ADMIN_TOKEN")
check "百分比流水自动备注" "按100的5%增加" "$(echo "$R" | json 'data.list[1].remark')"

echo "===== 6. 玩家视角 ====="
R=$(req POST /api/auth/login "{\"username\":\"$UNIQ\",\"password\":\"p123456\"}")
PLAYER_TOKEN=$(echo "$R" | json 'data.token')
check "玩家登录" "player" "$(echo "$R" | json 'data.user.role')"
R=$(req GET /api/balance '' "$PLAYER_TOKEN")
check "玩家余额=70" "70" "$(echo "$R" | json 'data.balance')"
R=$(req GET /api/transactions '' "$PLAYER_TOKEN")
check "玩家只能看到自己的历史(2条)" "2" "$(echo "$R" | json 'data.total')"
R=$(req GET "/api/transactions?playerId=1" '' "$PLAYER_TOKEN")
check "玩家查他人历史被拒绝(403)" "403" "$(echo "$R" | json 'code')"
R=$(req GET /api/admin/players '' "$PLAYER_TOKEN")
check "玩家访问管理接口被拒绝(403)" "403" "$(echo "$R" | json 'code')"
R=$(req POST /api/admin/adjust "{\"playerId\":$PID,\"amount\":10}" "$PLAYER_TOKEN")
check "玩家加减币被拒绝(403)" "403" "$(echo "$R" | json 'code')"

echo "===== 7. 登出 ====="
R=$(req POST /api/auth/logout '' "$PLAYER_TOKEN")
check "登出成功" "已退出登录" "$(echo "$R" | json 'message')"
R=$(req GET /api/balance '' "$PLAYER_TOKEN")
check "登出后token失效(401)" "401" "$(echo "$R" | json 'code')"

echo ""
echo "===== 结果: $PASS 通过, $FAIL 失败 ====="
[ "$FAIL" -eq 0 ] || exit 1
