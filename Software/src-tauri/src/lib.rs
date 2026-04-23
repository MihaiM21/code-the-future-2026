mod serial;
mod auth;
mod influx;

use serial::{SerialState, connect_serial, disconnect_serial, list_serial_ports, send_command};
use auth::{AuthResponse, Database, LoginRequest, RegisterRequest};
use influx::{InfluxState, influx_query_recent, influx_status};
use std::sync::Arc;

#[tauri::command]
fn register(state: tauri::State<Arc<Database>>, req: RegisterRequest) -> AuthResponse {
    match state.register(&req) {
        Ok(user) => AuthResponse {
            success: true,
            message: "Registration successful".to_string(),
            user: Some(user),
        },
        Err(e) => AuthResponse {
            success: false,
            message: format!("Registration failed: {}", e),
            user: None,
        },
    }
}

#[tauri::command]
fn login(state: tauri::State<Arc<Database>>, req: LoginRequest) -> AuthResponse {
    match state.login(&req.username, &req.password) {
        Ok(Some(user)) => AuthResponse {
            success: true,
            message: "Login successful".to_string(),
            user: Some(user),
        },
        Ok(None) => AuthResponse {
            success: false,
            message: "Invalid username or password".to_string(),
            user: None,
        },
        Err(e) => AuthResponse {
            success: false,
            message: format!("Login failed: {}", e),
            user: None,
        },
    }
}

#[tauri::command]
fn check_username_exists(state: tauri::State<Arc<Database>>, username: String) -> bool {
    state.user_exists(&username).unwrap_or(false)
}

#[cfg_attr(any(target_os = "android", target_os = "ios"), tauri::mobile_entry_point)]
pub fn run() {
    let db = Arc::new(
        Database::new("apex.db")
            .expect("Failed to initialize database"),
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SerialState::default())
        .manage(InfluxState::from_env())
        .manage(db)
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_serial,
            disconnect_serial,
            send_command,
            influx_status,
            influx_query_recent,
            register,
            login,
            check_username_exists,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
