mod serial;

use serial::{SerialState, connect_serial, disconnect_serial, list_serial_ports, send_command};

#[cfg_attr(any(target_os = "android", target_os = "ios"), tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SerialState::default())
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_serial,
            disconnect_serial,
            send_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
