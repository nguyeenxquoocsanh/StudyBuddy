#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "windows")]
use std::mem::size_of;
#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    System::SystemInformation::GetTickCount,
    UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
};

#[derive(Serialize)]
struct DesktopBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: f64,
}

#[tauri::command]
fn get_desktop_bounds(app: AppHandle) -> Result<DesktopBounds, String> {
    let monitor = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No primary display is available.".to_string())?;
    let position = monitor.position();
    let size = monitor.size();
    Ok(DesktopBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        scale: monitor.scale_factor(),
    })
}

#[tauri::command]
fn set_companion_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    let monitor = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No primary display is available.".to_string())?;
    let origin = monitor.position();
    let size = monitor.size();
    let scale = monitor.scale_factor();
    let max_x = origin.x + (f64::from(size.width) - 300.0 * scale).max(0.0) as i32;
    let max_y = origin.y + (f64::from(size.height) - 340.0 * scale).max(0.0) as i32;
    let window = app
        .get_webview_window("companion")
        .ok_or_else(|| "The desktop companion window is unavailable.".to_string())?;
    window
        .set_position(PhysicalPosition::new(
            x.clamp(origin.x, max_x),
            y.clamp(origin.y, max_y),
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_companion_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("companion")
        .ok_or_else(|| "The desktop companion window is unavailable.".to_string())?;
    if visible {
        window.show().map_err(|error| error.to_string())
    } else {
        window.hide().map_err(|error| error.to_string())
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn get_last_input_idle_ms() -> Result<u64, String> {
    let mut last_input = LASTINPUTINFO {
        cbSize: size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    if unsafe { GetLastInputInfo(&mut last_input) } == 0 {
        return Err("Windows could not read the last-input timestamp.".to_string());
    }
    let now = unsafe { GetTickCount() };
    Ok(u64::from(now.wrapping_sub(last_input.dwTime)))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn get_last_input_idle_ms() -> Result<u64, String> {
    Err("Desktop idle tracking is currently supported on Windows only.".to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let monitor = app.primary_monitor()?.ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "No primary display is available.",
                )
            })?;
            let position = monitor.position();
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let logical_width = f64::from(size.width) / scale;
            let logical_height = f64::from(size.height) / scale;
            let initial_x = position.x + ((logical_width - 300.0) / 2.0 * scale) as i32;
            let initial_y = position.y + ((logical_height - 340.0) * scale) as i32;

            WebviewWindowBuilder::new(app, "companion", WebviewUrl::App("companion.html".into()))
                .title("StudyBuddy Companion")
                .inner_size(300.0, 340.0)
                .position(f64::from(initial_x) / scale, f64::from(initial_y) / scale)
                .transparent(true)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .focusable(false)
                .resizable(false)
                .shadow(false)
                .visible(false)
                .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_desktop_bounds,
            get_last_input_idle_ms,
            set_companion_position,
            set_companion_visible
        ])
        .run(tauri::generate_context!())
        .expect("error while running StudyBuddy");
}
