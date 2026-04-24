use chrono::DateTime;
use csv::ReaderBuilder;
use reqwest::blocking::Client;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct InfluxConfig {
    pub url: String,
    pub org: String,
    pub bucket: String,
    pub token: String,
    pub measurement: String,
}

#[derive(Clone)]
struct InfluxWriter {
    tx: Sender<Value>,
}

#[derive(Clone)]
pub struct InfluxState {
    config: Option<InfluxConfig>,
    writer: Option<InfluxWriter>,
    last_write_error: Arc<Mutex<Option<String>>>,
    last_write_success: Arc<Mutex<Option<i64>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfluxStatus {
    pub enabled: bool,
    pub url: Option<String>,
    pub org: Option<String>,
    pub bucket: Option<String>,
    pub measurement: Option<String>,
    pub last_write_error: Option<String>,
    pub last_write_success: Option<i64>,
}

#[derive(Serialize)]
pub struct InfluxTelemetryPoint {
    pub ts: i64,
    pub air_temp: Option<f64>,
    pub air_quality: Option<f64>,
    pub pressure: Option<f64>,
    pub g_lat: Option<f64>,
    pub g_lon: Option<f64>,
    pub g_vert: Option<f64>,
    pub throttle: Option<f64>,
    pub brake: Option<f64>,
    pub rpm: Option<f64>,
}

impl InfluxState {
    pub fn from_env() -> Self {
        let _ = dotenvy::dotenv();
        let config = load_config();
        let last_write_error = Arc::new(Mutex::new(None));
        let last_write_success = Arc::new(Mutex::new(None));

        if let Some(cfg) = config.clone() {
            let writer = start_writer(cfg, Arc::clone(&last_write_error), Arc::clone(&last_write_success));
            Self {
                config,
                writer: Some(writer),
                last_write_error,
                last_write_success,
            }
        } else {
            Self {
                config: None,
                writer: None,
                last_write_error,
                last_write_success,
            }
        }
    }

    pub fn enqueue(&self, frame: &Value) {
        if let Some(writer) = &self.writer {
            if let Err(e) = writer.tx.send(frame.clone()) {
                let mut guard = self.last_write_error.lock().unwrap();
                *guard = Some(format!("Influx writer channel closed: {e}"));
            }
        }
    }

    pub fn status(&self) -> InfluxStatus {
        let last_write_error = self.last_write_error.lock().unwrap().clone();
        let last_write_success = *self.last_write_success.lock().unwrap();

        if let Some(cfg) = &self.config {
            InfluxStatus {
                enabled: true,
                url: Some(cfg.url.clone()),
                org: Some(cfg.org.clone()),
                bucket: Some(cfg.bucket.clone()),
                measurement: Some(cfg.measurement.clone()),
                last_write_error,
                last_write_success,
            }
        } else {
            InfluxStatus {
                enabled: false,
                url: None,
                org: None,
                bucket: None,
                measurement: None,
                last_write_error,
                last_write_success,
            }
        }
    }

    pub fn query_recent(
        &self,
        window_seconds: u32,
        every_ms: u32,
        limit: u32,
    ) -> Result<Vec<InfluxTelemetryPoint>, String> {
        let cfg = self
            .config
            .clone()
            .ok_or_else(|| "InfluxDB is not configured. Set INFLUX_URL, INFLUX_ORG, INFLUX_BUCKET, INFLUX_TOKEN.".to_string())?;

        query_points(cfg, window_seconds, every_ms, limit)
    }
}

#[tauri::command]
pub fn influx_status(state: tauri::State<InfluxState>) -> InfluxStatus {
    state.status()
}

#[tauri::command]
pub fn influx_query_recent(
    window_seconds: u32,
    every_ms: u32,
    limit: u32,
    state: tauri::State<InfluxState>,
) -> Result<Vec<InfluxTelemetryPoint>, String> {
    let clamped_window = window_seconds.clamp(30, 86_400);
    let clamped_every = every_ms.clamp(200, 60_000);
    let clamped_limit = limit.clamp(10, 10_000);

    state.query_recent(clamped_window, clamped_every, clamped_limit)
}

fn load_config() -> Option<InfluxConfig> {
    let url = env::var("INFLUX_URL").ok()?.trim().to_string();
    let org = env::var("INFLUX_ORG").ok()?.trim().to_string();
    let bucket = env::var("INFLUX_BUCKET").ok()?.trim().to_string();
    let token = env::var("INFLUX_TOKEN").ok()?.trim().to_string();
    let measurement = env::var("INFLUX_MEASUREMENT")
        .unwrap_or_else(|_| "esp32_telemetry".to_string())
        .trim()
        .to_string();

    if url.is_empty() || org.is_empty() || bucket.is_empty() || token.is_empty() {
        return None;
    }

    Some(InfluxConfig {
        url,
        org,
        bucket,
        token,
        measurement,
    })
}

fn start_writer(
    cfg: InfluxConfig,
    last_write_error: Arc<Mutex<Option<String>>>,
    last_write_success: Arc<Mutex<Option<i64>>>,
) -> InfluxWriter {
    let (tx, rx) = mpsc::channel::<Value>();
    thread::spawn(move || {
        let client = Client::new();
        while let Ok(frame) = rx.recv() {
            let result = write_point(&client, &cfg, &frame);
            let mut guard = last_write_error.lock().unwrap();
            match result {
                Ok(ts) => {
                    *guard = None;
                    let mut success_guard = last_write_success.lock().unwrap();
                    *success_guard = Some(ts);
                }
                Err(err) => *guard = Some(err),
            }
        }
    });

    InfluxWriter { tx }
}

fn write_point(client: &Client, cfg: &InfluxConfig, frame: &Value) -> Result<i64, String> {
    let line = to_line_protocol(cfg, frame).ok_or_else(|| "Telemetry frame missing numeric fields".to_string())?;
    let write_ts = extract_write_timestamp_ms(frame);

    let endpoint = format!(
        "{}/api/v2/write?org={}&bucket={}&precision=ms",
        cfg.url.trim_end_matches('/'),
        cfg.org,
        cfg.bucket
    );

    let resp = client
        .post(endpoint)
        .header("Authorization", format!("Token {}", cfg.token))
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Accept", "application/json")
        .body(line)
        .send()
        .map_err(|e| format!("Influx write request failed: {e}"))?;

    if resp.status().is_success() {
        Ok(write_ts)
    } else {
        let code = resp.status();
        let body = resp
            .text()
            .unwrap_or_else(|_| "<no response body>".to_string());
        Err(format!("Influx write failed ({code}): {body}"))
    }
}

fn to_line_protocol(cfg: &InfluxConfig, frame: &Value) -> Option<String> {
    let source_ts = frame.get("ts").and_then(|v| v.as_i64());
    let ts = normalize_timestamp_ms(source_ts);
    const STANDARD_GRAVITY: f64 = 9.80665;

    let air_temp = pick_numeric(frame, "air_temp")
        .or_else(|| pick_nested_numeric(frame, "dht22", "temperature_c"));
    let air_quality = pick_numeric(frame, "air_quality");
    let pressure = pick_numeric(frame, "pressure")
        .or_else(|| pick_nested_numeric(frame, "bmp280", "pressure_hpa"));
    let g_lat = pick_numeric(frame, "g_lat")
        .or_else(|| pick_nested_array_numeric(frame, "mpu6050", "accelerometer_m_s2", 0).map(|v| v / STANDARD_GRAVITY));
    let g_lon = pick_numeric(frame, "g_lon")
        .or_else(|| pick_nested_array_numeric(frame, "mpu6050", "accelerometer_m_s2", 1).map(|v| v / STANDARD_GRAVITY));
    let g_vert = pick_numeric(frame, "g_vert")
        .or_else(|| pick_nested_array_numeric(frame, "mpu6050", "accelerometer_m_s2", 2).map(|v| v / STANDARD_GRAVITY));
    let throttle = pick_numeric(frame, "throttle");
    let brake = pick_numeric(frame, "brake");
    let rpm = pick_numeric(frame, "rpm");

    let mut fields: Vec<String> = Vec::new();
    if let Some(raw_ts) = source_ts {
        fields.push(format!("source_ts={raw_ts}i"));
    }

    for (key, value) in [
        ("air_temp", air_temp),
        ("air_quality", air_quality),
        ("pressure", pressure),
        ("g_lat", g_lat),
        ("g_lon", g_lon),
        ("g_vert", g_vert),
        ("throttle", throttle),
        ("brake", brake),
        ("rpm", rpm),
    ] {
        if let Some(v) = value.filter(|v| v.is_finite()) {
            fields.push(format!("{key}={v}"));
        }
    }

    if fields.is_empty() {
        return None;
    }

    Some(format!("{} {} {}", cfg.measurement, fields.join(","), ts))
}

fn pick_numeric(frame: &Value, key: &str) -> Option<f64> {
    frame.get(key).and_then(|v| v.as_f64())
}

fn pick_nested_numeric(frame: &Value, parent: &str, key: &str) -> Option<f64> {
    frame.get(parent)?.get(key)?.as_f64()
}

fn pick_nested_array_numeric(frame: &Value, parent: &str, key: &str, index: usize) -> Option<f64> {
    frame.get(parent)?.get(key)?.as_array()?.get(index)?.as_f64()
}

fn normalize_timestamp_ms(source_ts: Option<i64>) -> i64 {
    match source_ts {
        Some(value) if value >= 1_000_000_000_000 && value < 4_102_444_800_000 => value,
        _ => SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
    }
}

fn extract_write_timestamp_ms(frame: &Value) -> i64 {
    normalize_timestamp_ms(frame.get("ts").and_then(|v| v.as_i64()))
}

fn query_points(
    cfg: InfluxConfig,
    window_seconds: u32,
    every_ms: u32,
    limit: u32,
) -> Result<Vec<InfluxTelemetryPoint>, String> {
    let endpoint = format!(
        "{}/api/v2/query?org={}",
        cfg.url.trim_end_matches('/'),
        cfg.org
    );

    let flux = format!(
        r#"
from(bucket: "{bucket}")
  |> range(start: -{window_seconds}s)
  |> filter(fn: (r) => r._measurement == "{measurement}")
  |> filter(fn: (r) => r._field == "air_temp" or r._field == "air_quality" or r._field == "pressure" or r._field == "g_lat" or r._field == "g_lon" or r._field == "g_vert" or r._field == "throttle" or r._field == "brake" or r._field == "rpm")
  |> aggregateWindow(every: {every_ms}ms, fn: mean, createEmpty: false)
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "air_temp", "air_quality", "pressure", "g_lat", "g_lon", "g_vert", "throttle", "brake", "rpm"])
  |> sort(columns: ["_time"])
  |> tail(n: {limit})
"#,
        bucket = cfg.bucket,
        measurement = cfg.measurement,
        window_seconds = window_seconds,
        every_ms = every_ms,
        limit = limit,
    );

    let body = serde_json::json!({
        "query": flux,
        "type": "flux"
    });

    let response = Client::new()
        .post(endpoint)
        .header("Authorization", format!("Token {}", cfg.token))
        .header("Content-Type", "application/json")
        .header("Accept", "application/csv")
        .json(&body)
        .send()
        .map_err(|e| format!("Influx query request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let msg = response
            .text()
            .unwrap_or_else(|_| "<no response body>".to_string());
        return Err(format!("Influx query failed ({status}): {msg}"));
    }

    let csv_payload = response
        .text()
        .map_err(|e| format!("Cannot read Influx CSV payload: {e}"))?;

    parse_flux_csv(&csv_payload)
}

fn parse_flux_csv(csv_payload: &str) -> Result<Vec<InfluxTelemetryPoint>, String> {
    let mut reader = ReaderBuilder::new()
        .has_headers(true)
        .comment(Some(b'#'))
        .from_reader(csv_payload.as_bytes());

    let headers = reader
        .headers()
        .map_err(|e| format!("Cannot parse Influx CSV headers: {e}"))?
        .clone();

    let mut points: Vec<InfluxTelemetryPoint> = Vec::new();

    for row in reader.records() {
        let rec = row.map_err(|e| format!("Cannot parse Influx CSV row: {e}"))?;
        let mut map = HashMap::<&str, &str>::new();
        for (i, value) in rec.iter().enumerate() {
            if let Some(header) = headers.get(i) {
                map.insert(header, value);
            }
        }

        let Some(time_str) = map.get("_time") else {
            continue;
        };

        let ts = DateTime::parse_from_rfc3339(time_str)
            .map_err(|e| format!("Invalid _time in Influx response: {e}"))?
            .timestamp_millis();

        points.push(InfluxTelemetryPoint {
            ts,
            air_temp: parse_f64(&map, "air_temp"),
            air_quality: parse_f64(&map, "air_quality"),
            pressure: parse_f64(&map, "pressure"),
            g_lat: parse_f64(&map, "g_lat"),
            g_lon: parse_f64(&map, "g_lon"),
            g_vert: parse_f64(&map, "g_vert"),
            throttle: parse_f64(&map, "throttle"),
            brake: parse_f64(&map, "brake"),
            rpm: parse_f64(&map, "rpm"),
        });
    }

    Ok(points)
}

fn parse_f64(map: &HashMap<&str, &str>, key: &str) -> Option<f64> {
    map.get(key).and_then(|v| {
        if v.is_empty() {
            None
        } else {
            v.parse::<f64>().ok()
        }
    })
}
