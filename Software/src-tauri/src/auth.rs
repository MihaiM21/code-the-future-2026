use rusqlite::{Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserRole {
    User,
    AuthorizedUser,
}

impl UserRole {
    fn as_db_value(&self) -> &'static str {
        match self {
            UserRole::User => "user",
            UserRole::AuthorizedUser => "authorized_user",
        }
    }

    fn from_db_value(value: &str) -> Self {
        match value {
            "authorized_user" => UserRole::AuthorizedUser,
            _ => UserRole::User,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub role: UserRole,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub success: bool,
    pub message: String,
    pub user: Option<User>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutonomyCommandRecord {
    pub id: String,
    pub rule_id: String,
    pub ts: i64,
    pub level: i64,
    pub domain: String,
    pub severity: String,
    pub title: String,
    pub rationale: String,
    pub trigger: String,
    pub suggested_commands: Vec<String>,
    pub command: String,
    pub requires_approval: bool,
    pub status: String,
    pub created_by_user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutonomyCatalogCommand {
    pub id: i64,
    pub command: String,
    pub source: String,
    pub created_by_user_id: Option<i64>,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &str) -> SqliteResult<Self> {
        let conn = Connection::open(db_path)?;
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Backwards-compatible migration for pre-role databases.
        let has_role_col = {
            let mut stmt = conn.prepare("PRAGMA table_info(users)")?;
            let cols = stmt.query_map([], |row| row.get::<_, String>(1))?;
            let mut found = false;
            for col in cols {
                if col? == "role" {
                    found = true;
                    break;
                }
            }
            found
        };

        if !has_role_col {
            conn.execute(
                "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
                [],
            )?;
        }

        conn.execute(
            "CREATE TABLE IF NOT EXISTS autonomy_commands (
                id TEXT PRIMARY KEY,
                rule_id TEXT NOT NULL,
                ts INTEGER NOT NULL,
                level INTEGER NOT NULL,
                domain TEXT NOT NULL,
                severity TEXT NOT NULL,
                title TEXT NOT NULL,
                rationale TEXT NOT NULL,
                trigger TEXT NOT NULL,
                suggested_commands TEXT NOT NULL,
                command TEXT NOT NULL,
                requires_approval INTEGER NOT NULL,
                status TEXT NOT NULL,
                created_by_user_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(created_by_user_id) REFERENCES users(id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS autonomy_command_catalog (
                id INTEGER PRIMARY KEY,
                command TEXT NOT NULL UNIQUE,
                source TEXT NOT NULL DEFAULT 'manual',
                created_by_user_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(created_by_user_id) REFERENCES users(id)
            )",
            [],
        )?;

        let authorized_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM users WHERE role = 'authorized_user'",
            [],
            |row| row.get(0),
        )?;
        let total_users: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;

        if authorized_count == 0 && total_users > 0 {
            conn.execute(
                "UPDATE users SET role = 'authorized_user' WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)",
                [],
            )?;
        }

        Ok(())
    }

    fn is_authorized_user(conn: &Connection, user_id: i64) -> SqliteResult<bool> {
        let role: SqliteResult<String> = conn.query_row(
            "SELECT role FROM users WHERE id = ?1",
            [user_id],
            |row| row.get(0),
        );

        match role {
            Ok(value) => Ok(value == "authorized_user"),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
            Err(e) => Err(e),
        }
    }

    pub fn register(&self, req: &RegisterRequest) -> SqliteResult<User> {
        let conn = self.conn.lock().unwrap();
        let password_hash = hash_password(&req.password);
        let user_count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        let role = if user_count == 0 {
            UserRole::AuthorizedUser
        } else {
            UserRole::User
        };

        conn.execute(
            "INSERT INTO users (username, email, password_hash, role) VALUES (?1, ?2, ?3, ?4)",
            (&req.username, &req.email, &password_hash, role.as_db_value()),
        )?;

        let id = conn.last_insert_rowid();

        Ok(User {
            id,
            username: req.username.clone(),
            email: req.email.clone(),
            role,
        })
    }

    pub fn login(&self, username: &str, password: &str) -> SqliteResult<Option<User>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, username, email, password_hash, role FROM users WHERE username = ?1",
        )?;

        let result = stmt.query_row([username], |row| {
            let id: i64 = row.get(0)?;
            let username: String = row.get(1)?;
            let email: String = row.get(2)?;
            let password_hash: String = row.get(3)?;
            let role: String = row.get(4)?;
            Ok((id, username, email, password_hash, role))
        });

        match result {
            Ok((id, username, email, password_hash, role)) => {
                if verify_password(password, &password_hash) {
                    Ok(Some(User {
                        id,
                        username,
                        email,
                        role: UserRole::from_db_value(&role),
                    }))
                } else {
                    Ok(None)
                }
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn get_user(&self, user_id: i64) -> SqliteResult<Option<User>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, username, email, role FROM users WHERE id = ?1")?;

        let result = stmt.query_row([user_id], |row| {
            let role: String = row.get(3)?;
            Ok(User {
                id: row.get(0)?,
                username: row.get(1)?,
                email: row.get(2)?,
                role: UserRole::from_db_value(&role),
            })
        });

        match result {
            Ok(user) => Ok(Some(user)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn user_exists(&self, username: &str) -> SqliteResult<bool> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM users WHERE username = ?1")?;
        let count: i64 = stmt.query_row([username], |row| row.get(0))?;
        Ok(count > 0)
    }

    pub fn save_autonomy_command(
        &self,
        command: &AutonomyCommandRecord,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let suggested_commands = serde_json::to_string(&command.suggested_commands)
            .map_err(|e| format!("Failed to serialize suggested commands: {}", e))?;

        conn.execute(
            "INSERT INTO autonomy_commands (
                id, rule_id, ts, level, domain, severity, title, rationale, trigger,
                suggested_commands, command, requires_approval, status, created_by_user_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
                rule_id = excluded.rule_id,
                ts = excluded.ts,
                level = excluded.level,
                domain = excluded.domain,
                severity = excluded.severity,
                title = excluded.title,
                rationale = excluded.rationale,
                trigger = excluded.trigger,
                suggested_commands = excluded.suggested_commands,
                command = excluded.command,
                requires_approval = excluded.requires_approval,
                status = excluded.status,
                created_by_user_id = excluded.created_by_user_id,
                updated_at = CURRENT_TIMESTAMP",
            (
                &command.id,
                &command.rule_id,
                command.ts,
                command.level,
                &command.domain,
                &command.severity,
                &command.title,
                &command.rationale,
                &command.trigger,
                &suggested_commands,
                &command.command,
                if command.requires_approval { 1 } else { 0 },
                &command.status,
                command.created_by_user_id,
            ),
        )
        .map_err(|e| format!("Failed to save autonomy command: {}", e))?;

        Ok(())
    }

    pub fn list_autonomy_commands(
        &self,
        requested_by_user_id: i64,
    ) -> Result<Vec<AutonomyCommandRecord>, String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let is_authorized = Self::is_authorized_user(&conn, requested_by_user_id)
            .map_err(|e| format!("Failed to verify user role: {}", e))?;
        if !is_authorized {
            return Err("Only Authorized Users can view persisted autonomy commands.".to_string());
        }

        let mut stmt = conn
            .prepare(
                "SELECT
                    id, rule_id, ts, level, domain, severity, title, rationale, trigger,
                    suggested_commands, command, requires_approval, status, created_by_user_id
                 FROM autonomy_commands
                 ORDER BY ts DESC",
            )
            .map_err(|e| format!("Failed to prepare autonomy command query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                let suggested_commands_json: String = row.get(9)?;
                let suggested_commands: Vec<String> =
                    serde_json::from_str(&suggested_commands_json).unwrap_or_default();

                Ok(AutonomyCommandRecord {
                    id: row.get(0)?,
                    rule_id: row.get(1)?,
                    ts: row.get(2)?,
                    level: row.get(3)?,
                    domain: row.get(4)?,
                    severity: row.get(5)?,
                    title: row.get(6)?,
                    rationale: row.get(7)?,
                    trigger: row.get(8)?,
                    suggested_commands,
                    command: row.get(10)?,
                    requires_approval: {
                        let v: i64 = row.get(11)?;
                        v == 1
                    },
                    status: row.get(12)?,
                    created_by_user_id: row.get(13)?,
                })
            })
            .map_err(|e| format!("Failed to query autonomy commands: {}", e))?;

        let mut items = Vec::new();
        for item in rows {
            items.push(item.map_err(|e| format!("Failed to read autonomy command row: {}", e))?);
        }

        Ok(items)
    }

    pub fn delete_autonomy_command(
        &self,
        requested_by_user_id: i64,
        id: &str,
    ) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let is_authorized = Self::is_authorized_user(&conn, requested_by_user_id)
            .map_err(|e| format!("Failed to verify user role: {}", e))?;
        if !is_authorized {
            return Err("Only Authorized Users can delete persisted autonomy commands.".to_string());
        }

        let rows = conn
            .execute("DELETE FROM autonomy_commands WHERE id = ?1", [id])
            .map_err(|e| format!("Failed to delete autonomy command: {}", e))?;

        Ok(rows > 0)
    }

    pub fn upsert_autonomy_catalog_commands(
        &self,
        requested_by_user_id: i64,
        commands: &[String],
        source: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let is_authorized = Self::is_authorized_user(&conn, requested_by_user_id)
            .map_err(|e| format!("Failed to verify user role: {}", e))?;
        if !is_authorized {
            return Err("Only Authorized Users can modify autonomy command catalog.".to_string());
        }

        for item in commands {
            let normalized = item.trim();
            if normalized.is_empty() {
                continue;
            }

            conn.execute(
                "INSERT INTO autonomy_command_catalog (command, source, created_by_user_id)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(command) DO UPDATE SET
                    source = excluded.source,
                    updated_at = CURRENT_TIMESTAMP",
                (normalized, source, requested_by_user_id),
            )
            .map_err(|e| format!("Failed to upsert autonomy catalog command: {}", e))?;
        }

        Ok(())
    }

    pub fn list_autonomy_catalog_commands(
        &self,
        requested_by_user_id: i64,
    ) -> Result<Vec<AutonomyCatalogCommand>, String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let is_authorized = Self::is_authorized_user(&conn, requested_by_user_id)
            .map_err(|e| format!("Failed to verify user role: {}", e))?;
        if !is_authorized {
            return Err("Only Authorized Users can view autonomy command catalog.".to_string());
        }

        let mut stmt = conn
            .prepare(
                "SELECT id, command, source, created_by_user_id
                 FROM autonomy_command_catalog
                 ORDER BY command ASC",
            )
            .map_err(|e| format!("Failed to prepare autonomy command catalog query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(AutonomyCatalogCommand {
                    id: row.get(0)?,
                    command: row.get(1)?,
                    source: row.get(2)?,
                    created_by_user_id: row.get(3)?,
                })
            })
            .map_err(|e| format!("Failed to query autonomy command catalog: {}", e))?;

        let mut items = Vec::new();
        for item in rows {
            items.push(item.map_err(|e| format!("Failed to read autonomy command catalog row: {}", e))?);
        }

        Ok(items)
    }

    pub fn delete_autonomy_catalog_command(
        &self,
        requested_by_user_id: i64,
        id: i64,
    ) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let is_authorized = Self::is_authorized_user(&conn, requested_by_user_id)
            .map_err(|e| format!("Failed to verify user role: {}", e))?;
        if !is_authorized {
            return Err("Only Authorized Users can delete autonomy catalog commands.".to_string());
        }

        let rows = conn
            .execute("DELETE FROM autonomy_command_catalog WHERE id = ?1", [id])
            .map_err(|e| format!("Failed to delete autonomy catalog command: {}", e))?;

        Ok(rows > 0)
    }
}

fn hash_password(password: &str) -> String {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Argon2,
    };

    let salt = SaltString::generate(rand::thread_rng());
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .unwrap_or_else(|_| "error".to_string())
}

fn verify_password(password: &str, hash: &str) -> bool {
    use argon2::{
        password_hash::PasswordHash,
        Argon2, PasswordVerifier,
    };

    let parsed_hash = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}
