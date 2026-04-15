use std::fs;
use std::path::Path;

const FRONTEND_FILES: &[&str] = &[
    "index.html",
    "mindspark_lite.css",
    "script.js",
    "desktop_bridge.js",
];

fn main() {
    let root = Path::new("..");
    let desktop_dist = root.join("desktop-dist");

    for file in FRONTEND_FILES {
        println!("cargo:rerun-if-changed=../{file}");
        let source = root.join(file);
        let target = desktop_dist.join(file);
        fs::copy(&source, &target).unwrap_or_else(|error| {
            panic!(
                "failed to sync frontend asset {} -> {}: {error}",
                source.display(),
                target.display()
            )
        });
    }

    tauri_build::build()
}
