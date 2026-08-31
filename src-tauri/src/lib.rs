use std::sync::Mutex;
use std::path::PathBuf;

use tauri::Manager;
use tauri::Emitter;
use tauri_plugin_fs::FsExt;

struct AppState {
    pending_file: Mutex<Option<PathBuf>>,
}

#[tauri::command]
fn allow_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err("not a file".into());
    }
    app.fs_scope()
        .allow_file(&p)
        .map_err(|e| format!("allow_file failed: {e}"))
}

/// 自定义字体用：把用户选中的字体文件加进 asset protocol scope，
/// 前端才能用 convertFileSrc() 得到的 asset:// URL 在 @font-face 里加载它。
/// 走 asset protocol 而非 base64，是因为中文字体动辄 10-20MB，
/// base64 会让每次启动多一次读盘 + 编码 + 解析约 1.3 倍体积的字符串。
#[tauri::command]
fn allow_font_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err("not a file".into());
    }
    app.asset_protocol_scope()
        .allow_file(&p)
        .map_err(|e| format!("allow_font_file failed: {e}"))
}

#[tauri::command]
fn allow_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("not a directory".into());
    }
    app.asset_protocol_scope()
        .allow_directory(&p, true)
        .map_err(|e| format!("allow_dir failed: {e}"))
}

/// 导出备份用：目标文件通常还不存在，因此只校验父目录，
/// 不像 allow_file 那样要求 is_file()。
#[tauri::command]
fn allow_save_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    match p.parent() {
        Some(dir) if dir.is_dir() => app
            .fs_scope()
            .allow_file(&p)
            .map_err(|e| format!("allow_save_file failed: {e}")),
        _ => Err("parent directory does not exist".into()),
    }
}

#[tauri::command]
fn get_pending_file(state: tauri::State<'_, AppState>) -> Option<PathBuf> {
    state.pending_file.lock().ok()?.take()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // 第二个实例启动时，把文件路径传给已有窗口
            if let Some(path) = argv.get(1).filter(|a| !a.starts_with('-')) {
                let _ = app.emit("open-file", path.to_string());
            }
            // 窗口最小化时 set_focus 无效，需要先恢复
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // 窗口状态插件恢复后再显示，避免闪一下默认位置
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            let args: Vec<String> = std::env::args().collect();
            let pending = args
                .iter()
                .skip(1)
                .find(|a| !a.starts_with('-'))
                .map(PathBuf::from);
            app.manage(AppState {
                pending_file: Mutex::new(pending),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            allow_file,
            allow_dir,
            allow_save_file,
            allow_font_file,
            get_pending_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
