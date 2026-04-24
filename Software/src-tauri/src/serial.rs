use std::io::{BufRead, BufReader, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};
use crate::influx::InfluxState;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortDescriptor {
    pub port_name: String,
    pub display_name: String,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub is_usb: bool,
    pub is_likely_esp: bool,
}

/// Shared write handle so we can send commands back to the serial port.
type SerialWriteHandle = Arc<Mutex<Option<Box<dyn Write + Send>>>>;

pub struct SerialState {
    pub write_handle: SerialWriteHandle,
}

impl Default for SerialState {
    fn default() -> Self {
        Self {
            write_handle: Arc::new(Mutex::new(None)),
        }
    }
}

/// List all available serial ports on the system.
#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<SerialPortDescriptor>, String> {
    let mut ports: Vec<SerialPortDescriptor> = serialport::available_ports()
        .map_err(|e| format!("Failed to list serial ports: {e}"))?
        .into_iter()
        .map(|p| {
            let port_name = p.port_name;
            match p.port_type {
                serialport::SerialPortType::UsbPort(info) => {
                    let manufacturer = info.manufacturer;
                    let product = info.product;
                    let serial_number = info.serial_number;
                    let vid = Some(info.vid);
                    let pid = Some(info.pid);

                    let mut display_parts = vec![port_name.clone()];
                    if let Some(product_name) = product.clone() {
                        if !product_name.trim().is_empty() {
                            display_parts.push(product_name);
                        }
                    }
                    if let Some(mfg) = manufacturer.clone() {
                        if !mfg.trim().is_empty() {
                            display_parts.push(format!("({mfg})"));
                        }
                    }

                    SerialPortDescriptor {
                        port_name: port_name.clone(),
                        display_name: display_parts.join(" "),
                        manufacturer: manufacturer.clone(),
                        product: product.clone(),
                        serial_number,
                        vid,
                        pid,
                        is_usb: true,
                        is_likely_esp: is_likely_esp(
                            manufacturer.as_deref(),
                            product.as_deref(),
                            vid,
                            pid,
                        ),
                    }
                }
                _ => SerialPortDescriptor {
                    port_name: port_name.clone(),
                    display_name: port_name,
                    manufacturer: None,
                    product: None,
                    serial_number: None,
                    vid: None,
                    pid: None,
                    is_usb: false,
                    is_likely_esp: false,
                },
            }
        })
        .collect();

    ports.sort_by(|a, b| {
        b.is_likely_esp
            .cmp(&a.is_likely_esp)
            .then(a.port_name.cmp(&b.port_name))
    });

    Ok(ports)
}

fn is_likely_esp(
    manufacturer: Option<&str>,
    product: Option<&str>,
    vid: Option<u16>,
    pid: Option<u16>,
) -> bool {
    let searchable = [manufacturer.unwrap_or(""), product.unwrap_or("")]
        .join(" ")
        .to_lowercase();

    // Common USB bridge / device strings seen with ESP32 boards.
    let name_match = [
        "espressif",
        "esp32",
        "cp210",
        "ch340",
        "ch910",
        "silicon labs",
        "wch",
        "ft232",
        "usb serial",
    ]
    .iter()
    .any(|needle| searchable.contains(needle));

    // Known VIDs that frequently appear with ESP32 boards or USB-UART bridges.
    let vid_match = matches!(vid, Some(0x303A | 0x10C4 | 0x1A86 | 0x0403));
    let pid_match = pid.is_some();

    name_match || (vid_match && pid_match)
}

/// Open a serial port and spawn a background thread that reads line-delimited
/// JSON frames and emits `telemetry-update` events to the frontend.
#[tauri::command]
pub fn connect_serial(
    port: String,
    baud: u32,
    app: AppHandle,
    state: tauri::State<SerialState>,
    influx: tauri::State<InfluxState>,
) -> Result<(), String> {
    let serial = serialport::new(&port, baud)
        .timeout(std::time::Duration::from_millis(5000))
        .open()
        .map_err(|e| format!("Cannot open {port}: {e}"))?;

    // Keep a clone for writing commands back
    let write_clone = serial
        .try_clone()
        .map_err(|e| format!("Cannot clone serial port: {e}"))?;

    {
        let mut handle = state.write_handle.lock().unwrap();
        *handle = Some(Box::new(write_clone));
    }

    // Spawn a reader thread
    let app_clone = app.clone();
    let influx_state = influx.inner().clone();
    thread::spawn(move || {
        let reader = BufReader::new(serial);
        for line in reader.lines() {
            match line {
                Ok(json) => {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json) {
                        influx_state.enqueue(&value);
                        let _ = app_clone.emit("telemetry-update", value);
                    }
                }
                Err(e) => {
                    eprintln!("[serial] Read error: {e}");
                    // Emit disconnect notification
                    let _ = app_clone.emit("serial-disconnected", ());
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Close the serial port (by dropping the write handle; the reader will error out).
#[tauri::command]
pub fn disconnect_serial(state: tauri::State<SerialState>) -> Result<(), String> {
    let mut handle = state.write_handle.lock().unwrap();
    *handle = None;
    Ok(())
}

/// Write a command string back to the ESP32 / RPi.
/// Commands are newline-terminated strings e.g. "SET_AUTONOMY:2\n".
#[tauri::command]
pub fn send_command(
    cmd: String,
    state: tauri::State<SerialState>,
) -> Result<(), String> {
    let mut handle = state.write_handle.lock().unwrap();
    if let Some(writer) = handle.as_mut() {
        let line = format!("{}\n", cmd.trim());
        writer
            .write_all(line.as_bytes())
            .map_err(|e| format!("Write error: {e}"))?;
        writer.flush().map_err(|e| format!("Flush error: {e}"))?;
        Ok(())
    } else {
        Err("Not connected".to_string())
    }
}
