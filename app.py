import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import libsql_client

app = Flask(__name__, static_folder='dist', static_url_path='/')
# Enable CORS to support Frontend UI
CORS(app, resources={r"/*": {"origins": "*"}})

ACCESS_PASSWORD = os.getenv("VITE_APP_PASSWORD", "YH2026").strip()

def get_db():
    # 优先读取 LIBSQL 变量，兼容旧版 TURSO 变量
    url = os.getenv("LIBSQL_URL") or os.getenv("TURSO_DATABASE_URL")
    auth_token = os.getenv("LIBSQL_AUTH_TOKEN") or os.getenv("TURSO_AUTH_TOKEN")
    
    # 安全的调试日志：不打印真实 Token，只打印状态
    print(f"[DB Debug] URL set: {bool(url)}, AuthToken set: {bool(auth_token)} (len: {len(auth_token) if auth_token else 0})")
    
    if not url:
        raise ValueError("Database URL (LIBSQL_URL or TURSO_DATABASE_URL) environment variable is not set")
    
    try:
        return libsql_client.create_client_sync(url=url, auth_token=auth_token)
    except Exception as e:
        err_str = str(e).lower()
        if "unauthorized" in err_str or "401" in err_str or "forbidden" in err_str:
            print("[CRITICAL] Database Authentication Failed: Token Invalid")
            raise Exception("Token Invalid")
        raise e

# ===== 认证中间件 =====
@app.before_request
def auth_middleware():
    # 静态资源、健康检查和登录接口不进行中间件拦截
    if not request.path.startswith('/api/') or \
       request.path.startswith('/api/health') or \
       request.path.startswith('/api/login'):
        return
        
    if request.method == 'OPTIONS':
        return
        
    # 同时兼容两种 Header 名称
    pw_header = request.headers.get('x-api-password') or request.headers.get('X-Password')
    
    if pw_header == ACCESS_PASSWORD and ACCESS_PASSWORD:
        return
    else:
        print(f"[Auth Debug] Unauthorized access to {request.path}. Header set: {bool(pw_header)}")
        return jsonify({'error': 'Unauthorized'}), 401

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    password = (data.get('password') or "").strip()
    
    if password == ACCESS_PASSWORD and ACCESS_PASSWORD:
        print("[Auth Debug] Login Successful")
        return jsonify({'success': True})
    
    print(f"[Auth Debug] Login Failed. Received: '{password[:2]}...', Expected: '{ACCESS_PASSWORD[:2]}...'")
    return jsonify({'error': 'Unauthorized'}), 401

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "db": "turso"})

# ===== 核心任务 3: 业务逻辑映射 (对应已建好的 Turso 表) =====

# --- 成员管理：对应 members 表 ---
@app.route('/api/players', methods=['GET'])
def get_players():
    try:
        client = get_db()
        result = client.execute("SELECT id, name, type, defaultFee, isFunder FROM members")
        players = []
        for row in result.rows:
            players.append({
                "id": row[0],
                "name": row[1],
                "type": row[2],
                "defaultFee": float(row[3]) if row[3] is not None else 0,
                "isFunder": bool(row[4])
            })
        client.close()
        return jsonify(players)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/players', methods=['POST'])
def save_player():
    try:
        data = request.get_json()
        if not data or 'id' not in data:
            return jsonify({"error": "Missing ID"}), 400
        client = get_db()
        client.execute(
            """
            INSERT INTO members (id, name, type, defaultFee, isFunder) 
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                name=excluded.name, 
                type=excluded.type, 
                defaultFee=excluded.defaultFee, 
                isFunder=excluded.isFunder
            """,
            [
                data['id'], data.get('name', ''), data.get('type', ''), 
                data.get('defaultFee', 0), 1 if data.get('isFunder') else 0
            ]
        )
        client.close()
        return jsonify({"success": True, "id": data['id']}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/players/<player_id>', methods=['DELETE'])
def delete_player(player_id):
    try:
        client = get_db()
        client.execute("DELETE FROM members WHERE id = ?", [player_id])
        client.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- 周期与股东、身份配置、活动记录组合端点 ---
@app.route('/api/periods', methods=['GET'])
def get_periods():
    try:
        client = get_db()
        cycles_result = client.execute("SELECT id, name, startDate, endDate, courtCost, funderIds FROM cycles")
        cycles = {}
        for row in cycles_result.rows:
            cycles[row[0]] = {
                "id": row[0], "name": row[1], "startDate": row[2], "endDate": row[3],
                "courtCost": float(row[4]) if row[4] is not None else 0,
                "funderIds": json.loads(row[5]) if row[5] else [],
                "sessions": [], "playerConfigs": []
            }
        
        sessions_result = client.execute("SELECT id, cycle_id, date, players, extraCourtCost FROM sessions")
        for row in sessions_result.rows:
            cycle_id = row[1]
            if cycle_id in cycles:
                cycles[cycle_id]["sessions"].append({
                    "id": row[0], "date": row[2],
                    "players": json.loads(row[3]) if row[3] else [],
                    "extraCourtCost": float(row[4]) if row[4] is not None else 0
                })
        
        configs_result = client.execute("SELECT cycle_id, player_id, type, has_paid_base FROM member_cycle_configs")
        for row in configs_result.rows:
            cycle_id = row[0]
            if cycle_id in cycles:
                cycles[cycle_id]["playerConfigs"].append({
                    "playerId": row[1], "type": row[2], "hasPaidBase": bool(row[3])
                })
        client.close()
        return jsonify(list(cycles.values()))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/periods', methods=['POST'])
def save_period():
    try:
        data = request.get_json()
        cycle_id = data['id']
        client = get_db()
        
        # 开启事务
        transaction = client.transaction()
        transaction.execute(
            """
            INSERT INTO cycles (id, name, startDate, endDate, courtCost, funderIds) 
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                name=excluded.name, startDate=excluded.startDate, 
                endDate=excluded.endDate, courtCost=excluded.courtCost, 
                funderIds=excluded.funderIds
            """,
            [
                cycle_id, data.get('name', ''), data.get('startDate', ''), 
                data.get('endDate', ''), data.get('courtCost', 0), 
                json.dumps(data.get('funderIds', []))
            ]
        )
        
        transaction.execute("DELETE FROM sessions WHERE cycle_id = ?", [cycle_id])
        for session in data.get('sessions', []):
            transaction.execute(
                """
                INSERT INTO sessions (id, cycle_id, date, players, extraCourtCost)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    session['id'], cycle_id, session.get('date', ''),
                    json.dumps(session.get('players', [])), session.get('extraCourtCost', 0)
                ]
            )
            
        transaction.execute("DELETE FROM member_cycle_configs WHERE cycle_id = ?", [cycle_id])
        for config in data.get('playerConfigs', []):
            transaction.execute(
                """
                INSERT INTO member_cycle_configs (cycle_id, player_id, type, has_paid_base)
                VALUES (?, ?, ?, ?)
                """,
                [
                    cycle_id, config['playerId'], config.get('type', ''), 
                    1 if config.get('hasPaidBase') else 0
                ]
            )
            
        transaction.commit()
        client.close()
        return jsonify({"success": True, "id": cycle_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/periods/<period_id>', methods=['DELETE'])
def delete_period(period_id):
    try:
        client = get_db()
        transaction = client.transaction()
        transaction.execute("DELETE FROM cycles WHERE id = ?", [period_id])
        transaction.execute("DELETE FROM sessions WHERE cycle_id = ?", [period_id])
        transaction.execute("DELETE FROM member_cycle_configs WHERE cycle_id = ?", [period_id])
        transaction.commit()
        client.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ===== 核心任务 4: 必须保留的逻辑内核 (通过 SQL 聚合查询实现实时收益计算) =====
@app.route('/api/report/sql_aggregate/<cycle_id>', methods=['GET'])
def get_finance_report_sql(cycle_id):
    try:
        client = get_db()
        
        # “包月零收费：检查 has_paid_base，若为 1 则本次活动该成员收费为 0。
        #  实时收益计算：执行 SQL 聚合查询：(本期所有收费 + 股东集资) - 场地支出 / 股东人数。”
        sql = '''
        WITH json_players AS (
            SELECT cycle_id, extraCourtCost, json_each.value AS player_id 
            FROM sessions, json_each(sessions.players)
            WHERE cycle_id = ?
        ),
        player_fees AS (
            SELECT 
                jp.cycle_id, 
                jp.player_id, 
                m.defaultFee,
                c.has_paid_base,
                CASE 
                    WHEN coalesce(c.has_paid_base, 0) = 1 THEN 0 
                    ELSE m.defaultFee 
                END as session_fee
            FROM json_players jp
            JOIN members m ON jp.player_id = m.id
            LEFT JOIN member_cycle_configs c ON jp.cycle_id = c.cycle_id AND c.player_id = m.id
        ),
        total_income AS (
            SELECT coalesce(sum(session_fee), 0) as income FROM player_fees
        ),
        cycle_info AS (
            SELECT 
                courtCost, 
                json_array_length(funderIds) as funder_count,
                (SELECT coalesce(sum(extraCourtCost), 0) FROM sessions WHERE cycle_id = ?) as total_extra
            FROM cycles 
            WHERE id = ?
        )
        SELECT 
            (SELECT income FROM total_income) as total_activity_fees,
            ci.courtCost,
            ci.total_extra,
            ci.funder_count,
            ((SELECT income FROM total_income) - ci.courtCost - ci.total_extra) / nullif(ci.funder_count, 0) as profit_per_funder
        FROM cycle_info ci;
        '''
        res = client.execute(sql, [cycle_id, cycle_id, cycle_id])
        report = {}
        if res.rows:
            r = res.rows[0]
            report = {
                 "totalActivityFees": r[0] or 0,
                 "courtCost": r[1] or 0,
                 "totalExtraCost": r[2] or 0,
                 "funderCount": r[3] or 0,
                 "profitPerFunder": r[4] or 0
            }

        client.close()
        return jsonify({"success": True, "data": report})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    # Check if the file exists in the static folder
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return app.send_static_file(path)
    # Otherwise, return the index.html for React Router / SPA fallback
    return app.send_static_file('index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
