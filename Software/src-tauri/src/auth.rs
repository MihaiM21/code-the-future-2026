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
