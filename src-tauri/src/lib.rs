use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// 模块级静态队列——在 single-instance 回调中使用，不依赖 setup。
/// Windows `%1` 逐文件调用 exe，single-instance 回调可能在 setup 之前触发，
/// 此时 AppState 尚未初始化，只有静态变量可用。
static QUEUED_FILES: OnceLock<Mutex<VecDeque<PathBuf>>> = OnceLock::new();

fn static_queue() -> &'static Mutex<VecDeque<PathBuf>> {
    QUEUED_FILES.get_or_init(|| Mutex::new(VecDeque::new()))
}

struct AppState {
    pending_files: Mutex<Vec<PathBuf>>,
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
fn get_pending_files(state: tauri::State<'_, AppState>) -> Vec<String> {
    state
        .pending_files
        .lock()
        .ok()
        .map(|mut v| {
            v.drain(..)
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

/// 从静态队列中取出所有排队的文件路径。
/// single-instance 回调在 setup 之前触发时，文件存在静态队列里；
/// 前端每秒轮询一次此命令来 drain。
#[tauri::command]
fn drain_queued_files() -> Vec<String> {
    static_queue()
        .lock()
        .ok()
        .map(|mut q| {
            q.drain(..)
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files: Vec<String> = argv
                .iter()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .cloned()
                .collect();

            // 存入静态队列（不依赖 AppState）
            if let Ok(mut q) = static_queue().lock() {
                for f in &files {
                    q.push_back(PathBuf::from(f));
                }
            }

            // 同时 emit 事件（前端 listen 就绪后能直接收到）
            for f in &files {
                let _ = app.emit("open-file", f.clone());
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            let args: Vec<String> = std::env::args().collect();
            let mut pending: Vec<PathBuf> = args
                .iter()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .map(PathBuf::from)
                .collect();

            // 把 setup 前 single-instance 回调存入静态队列的文件也合并进来
            if let Ok(mut q) = static_queue().lock() {
                pending.extend(q.drain(..));
            }

            app.manage(AppState {
                pending_files: Mutex::new(pending),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            allow_file,
            allow_dir,
            allow_save_file,
            allow_font_file,
            get_pending_files,
            drain_queued_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
