import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import libsql_client

app = Flask(__name__, static_folder='dist', static_url_path='/')
# Enable CORS to support Frontend UI
CORS(app, resources={r"/*": {"origins": "*"}})

ACCESS_PASSWORD = os.getenv("VITE_APP_PASSWORD", "cainiao").strip()

def get_db():
    # 优先读取 LIBSQL 变量，兼容旧版 TURSO 变量
    url = (os.getenv("LIBSQL_URL") or os.getenv("TURSO_DATABASE_URL") or "").strip()
    auth_token = (os.getenv("LIBSQL_AUTH_TOKEN") or os.getenv("TURSO_AUTH_TOKEN") or "").strip()
    
    # 强制调试日志
    print(f"[DB Init] URL prefix: {url[:10]}..., Token set: {bool(auth_token)}")
    
    if not url:
        print("[CRITICAL] Database URL is MISSING.")
        raise ValueError("Missing LIBSQL_URL or TURSO_DATABASE_URL")
    
    try:
        from datetime import datetime
        now = datetime.now().strftime("%H:%M:%S.%f")
        # 强制检查 URL 协议头，Turso 推荐使用 libsql:// 或 https://
        print(f"[{now}] [DB Init] Step 1: Creating client. URL: {url[:20]}...")
        client = libsql_client.create_client_sync(url=url, auth_token=auth_token)
        print(f"[{datetime.now().strftime('%H:%M:%S.%f')}] [DB Init] Step 2: Client object created.")
        return client
    except Exception as e:
        print(f"[{datetime.now().strftime('%H:%M:%S.%f')}] [CRITICAL] CREATE_CLIENT_ERROR: {str(e)}")
        raise e

# ===== 认证中间件 =====
@app.before_request
def auth_middleware():
    # 静态资源、健康检查、登录接口以及调试接口不进行中间件拦截
    if not request.path.startswith('/api/') or \
       request.path.startswith('/api/health') or \
       request.path.startswith('/api/debug_db') or \
       request.path.startswith('/api/env_check') or \
       request.path.startswith('/api/login'):
        return
        
    if request.method == 'OPTIONS':
        return
        
    # 同时兼容两种 Header 名称，并进行去除空格处理
    pw_header = (request.headers.get('x-api-password') or request.headers.get('X-Password') or "").strip()
    
    if pw_header == ACCESS_PASSWORD and ACCESS_PASSWORD:
        return
    else:
        # 在日志中输出详细对比（不打印完整密码以保安全）
        print(f"[Auth Debug] Unauthorized. Received len: {len(pw_header)}, Expected len: {len(ACCESS_PASSWORD)}")
        return jsonify({'error': 'Unauthorized'}), 401

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    password = (data.get('password') or "").strip()
    
    if password == ACCESS_PASSWORD and ACCESS_PASSWORD:
        print("[Auth Debug] Login Successful")
        return jsonify({'success': True})
    
    print(f"[Auth Debug] Login Failed. Received len: {len(password)}, Expected len: {len(ACCESS_PASSWORD)}")
    return jsonify({'error': 'Unauthorized'}), 401

@app.route('/api/health', methods=['GET'])
def health():
    db_status = "Unknown"
    details = {}
    try:
        client = get_db()
        client.execute("SELECT 1")
        db_status = "Connected"
        client.close()
    except Exception as e:
        db_status = f"Error: {str(e)}"
        print(f"[Health Check Error] {str(e)}")
    
    return jsonify({
        'status': 'ok',
        'database': db_status,
        'url_configured': bool(os.getenv("LIBSQL_URL") or os.getenv("TURSO_DATABASE_URL"))
    })

@app.route('/api/env_check', methods=['GET'])
def env_check():
    """纯环境检查，不访问数据库，验证后端存活及变量加载情况"""
    url = os.getenv("LIBSQL_URL") or os.getenv("TURSO_DATABASE_URL") or ""
    token = os.getenv("LIBSQL_AUTH_TOKEN") or os.getenv("TURSO_AUTH_TOKEN") or ""
    return jsonify({
        "status": "backend_is_alive",
        "url_status": {
            "is_set": bool(url),
            "prefix": url[:15] if url else "none",
            "len": len(url)
        },
        "token_status": {
            "is_set": bool(token),
            "len": len(token)
        },
        "password_configured": bool(ACCESS_PASSWORD)
    })

@app.route('/api/debug_db', methods=['GET'])
def debug_db():
    env_info = {
        "LIBSQL_URL_SET": bool(os.getenv("LIBSQL_URL") or os.getenv("TURSO_DATABASE_URL")),
        "LIBSQL_TOKEN_SET": bool(os.getenv("LIBSQL_AUTH_TOKEN") or os.getenv("TURSO_AUTH_TOKEN")),
        "URL_PREFIX": (os.getenv("LIBSQL_URL") or os.getenv("TURSO_DATABASE_URL") or "")[:15]
    }
    try:
        client = get_db()
        # 1. 查表名
        tables = client.execute("SELECT name FROM sqlite_master WHERE type='table'").rows
        table_names = [t[0] for t in tables]
        
        # 2. 查 members 表结构
        schema = []
        if 'members' in table_names:
            columns = client.execute("PRAGMA table_info(members)").rows
            schema = [f"{c[1]} ({c[2]})" for c in columns]
            
        client.close()
        return jsonify({
            "env": env_info,
            "tables": table_names,
            "members_schema": schema,
            "libsql_version": getattr(libsql_client, '__version__', 'unknown')
        })
    except Exception as e:
        return jsonify({
            "env": env_info,
            "debug_error": str(e)
        }), 500

@app.errorhandler(500)
def handle_500_error(e):
    print(f"[GLOBAL 500 ERROR] {str(e)}")
    original_err = getattr(e, 'original_exception', e)
    return jsonify({"error": str(original_err)}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    # 针对 401 不转为 500
    if hasattr(e, 'code') and e.code == 401:
        return jsonify({"error": str(e)}), 401
    print(f"[GLOBAL UNHANDLED EXCEPTION] {str(e)}")
    return jsonify({"error": str(e)}), 500

# ===== 核心任务 3: 业务逻辑映射 (对应已建好的 Turso 表) =====

# --- 成员管理：对应 members 表 ---
@app.route('/api/players', methods=['GET'])
def get_players():
    try:
        client = get_db()
        # 使用动态字段，防止因为某一个字段不存在导致整条 SQL 崩掉
        sql = "SELECT id, name FROM members"
        print("[DB Query] Fetching members...")
        result = client.execute(sql)
        
        players = []
        # 获取列索引，安全映射
        col_names = [col for col in result.columns]
        print(f"[DB Result] Columns found: {col_names}")

        for row in result.rows:
            # 基础字段
            p = {"id": str(row[0]), "name": str(row[1])}
            
            # 尝试补充其他字段 (兼容不同表结构)
            # 在 members 表中，这些字段可能叫不同的名字或不存在
            for i, name in enumerate(col_names):
                if name.lower() in ['type', 'role']: p['type'] = row[i]
                if name.lower() in ['defaultfee', 'fee']: p['defaultFee'] = float(row[i]) if row[i] is not None else 0
                if name.lower() in ['isfunder', 'funder']: p['isFunder'] = bool(row[i])
            
            # 设置默认值
            if 'type' not in p: p['type'] = 'normal'
            if 'defaultFee' not in p: p['defaultFee'] = 0
            if 'isFunder' not in p: p['isFunder'] = False
                
            players.append(p)
        client.close()
        return jsonify(players)
    except Exception as e:
        err_msg = str(e)
        print(f"DEBUG_DB_ERROR (get_players): {err_msg}")
        if "no such table" in err_msg.lower():
            return jsonify([])
        return jsonify({"error": f"Database Query Failed: {err_msg}"}), 500

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
        print(f"DEBUG_DB_ERROR (save_player): {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/players/<player_id>', methods=['DELETE'])
def delete_player(player_id):
    try:
        client = get_db()
        client.execute("DELETE FROM members WHERE id = ?", [player_id])
        client.close()
        return jsonify({"success": True})
    except Exception as e:
        print(f"DEBUG_DB_ERROR (delete_player): {str(e)}")
        return jsonify({"error": str(e)}), 500

# --- 周期与股东、身份配置、活动记录组合端点 ---
@app.route('/api/periods', methods=['GET'])
def get_periods():
    try:
        client = get_db()
        cycles = {}
        
        # 处理 cycles 表
        try:
            cycles_result = client.execute("SELECT id, name, startDate, endDate, courtCost, funderIds FROM cycles")
            for row in cycles_result.rows:
                cycles[row[0]] = {
                    "id": row[0], "name": row[1], "startDate": row[2], "endDate": row[3],
                    "courtCost": float(row[4]) if row[4] is not None else 0,
                    "funderIds": json.loads(row[5]) if row[5] else [],
                    "sessions": [], "playerConfigs": []
                }
        except Exception as e:
            print(f"DEBUG_DB_ERROR (fetch cycles): {str(e)}")
            if "no such table" not in str(e).lower():
                raise e

        # 处理 sessions 表
        try:
            sessions_result = client.execute("SELECT id, cycle_id, date, players, extraCourtCost FROM sessions")
            for row in sessions_result.rows:
                cycle_id = row[1]
                if cycle_id in cycles:
                    cycles[cycle_id]["sessions"].append({
                        "id": row[0], "date": row[2],
                        "players": json.loads(row[3]) if row[3] else [],
                        "extraCourtCost": float(row[4]) if row[4] is not None else 0
                    })
        except Exception as e:
            print(f"DEBUG_DB_ERROR (fetch sessions): {str(e)}")
            # 表不存在时不抛异常，允许返回基础数据
            if "no such table" not in str(e).lower():
                raise e

        # 处理 member_cycle_configs 表
        try:
            configs_result = client.execute("SELECT cycle_id, player_id, type, has_paid_base FROM member_cycle_configs")
            for row in configs_result.rows:
                cycle_id = row[0]
                if cycle_id in cycles:
                    cycles[cycle_id]["playerConfigs"].append({
                        "playerId": row[1], "type": row[2], "hasPaidBase": bool(row[3])
                    })
        except Exception as e:
            print(f"DEBUG_DB_ERROR (fetch member_cycle_configs): {str(e)}")
            if "no such table" not in str(e).lower():
                raise e

        client.close()
        return jsonify(list(cycles.values()))
    except Exception as e:
        err_msg = str(e)
        print(f"DEBUG_DB_ERROR (get_periods_main): {err_msg}")
        return jsonify({"error": err_msg}), 500

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
        try:
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
        except Exception as sqlite_err:
            print(f"DEBUG_DB_ERROR (sql_aggregate query): {str(sqlite_err)}")
            if "no such table" in str(sqlite_err).lower():
                return jsonify({"success": True, "data": {
                     "totalActivityFees": 0, "courtCost": 0, "totalExtraCost": 0, "funderCount": 0, "profitPerFunder": 0
                }})
            raise sqlite_err
            
    except Exception as e:
        print(f"DEBUG_DB_ERROR (get_finance_report_sql_main): {str(e)}")
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
